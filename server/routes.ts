import type { Express } from "express";
import { createServer, type Server } from "http";
// Don't need WebSocketServer import here as it's imported in websocket.ts
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { z } from "zod";
import { 
  insertClassroomSchema, insertLectureSchema, insertAssignmentSchema, 
  insertMaterialSchema, insertMessageSchema, insertLectureNoteSchema, 
  insertClassroomMemberSchema, insertLectureRecordingSchema 
} from "@shared/schema";
import { setupWebSockets } from "./websocket";
import { nanoid } from "nanoid";

function isAuthenticated(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

function isTeacher(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if (req.isAuthenticated() && req.user.role === "teacher") {
    return next();
  }
  res.status(403).json({ message: "Forbidden - Teacher role required" });
}

function canAccessClassroom(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const classroomId = parseInt(req.params.classroomId);
  if (isNaN(classroomId)) {
    return res.status(400).json({ message: "Invalid classroom ID" });
  }
  
  storage.isUserInClassroom(req.user.id, classroomId)
    .then(isUserInClassroom => {
      if (isUserInClassroom) {
        return next();
      }
      res.status(403).json({ message: "Forbidden - Not a member of this classroom" });
    })
    .catch(next);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // Classroom routes
  app.post("/api/classrooms", isTeacher, async (req, res, next) => {
    try {
      const data = insertClassroomSchema.parse({
        ...req.body,
        createdBy: req.user.id,
        code: req.body.code || nanoid(6) // Generate a unique code if not provided
      });
      
      const classroom = await storage.createClassroom(data);
      res.status(201).json(classroom);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/classrooms", isAuthenticated, async (req, res, next) => {
    try {
      const classrooms = await storage.getClassroomsByUser(req.user.id);
      res.json(classrooms);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/classrooms/:id", isAuthenticated, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.id);
      if (isNaN(classroomId)) {
        return res.status(400).json({ message: "Invalid classroom ID" });
      }
      
      const isUserInClassroom = await storage.isUserInClassroom(req.user.id, classroomId);
      if (!isUserInClassroom) {
        return res.status(403).json({ message: "Forbidden - Not a member of this classroom" });
      }
      
      const classroom = await storage.getClassroom(classroomId);
      if (!classroom) {
        return res.status(404).json({ message: "Classroom not found" });
      }
      
      res.json(classroom);
    } catch (err) {
      next(err);
    }
  });
  
  app.post("/api/classrooms/join", isAuthenticated, async (req, res, next) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ message: "Classroom code is required" });
      }
      
      const classroom = await storage.getClassroomByCode(code);
      if (!classroom) {
        return res.status(404).json({ message: "Classroom not found with this code" });
      }
      
      const isUserInClassroom = await storage.isUserInClassroom(req.user.id, classroom.id);
      if (isUserInClassroom) {
        return res.status(400).json({ message: "Already a member of this classroom" });
      }
      
      const member = await storage.addMemberToClassroom({
        classroomId: classroom.id,
        userId: req.user.id,
        role: req.user.role
      });
      
      res.status(201).json({ classroom, member });
    } catch (err) {
      next(err);
    }
  });
  
  // Classroom members routes
  app.get("/api/classrooms/:classroomId/members", canAccessClassroom, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.classroomId);
      const members = await storage.getClassroomMembers(classroomId);
      
      // Get user details for each member
      const memberDetails = await Promise.all(
        members.map(async (member) => {
          const user = await storage.getUser(member.userId);
          if (user) {
            const { password, ...userWithoutPassword } = user;
            return {
              ...member,
              user: userWithoutPassword
            };
          }
          return member;
        })
      );
      
      res.json(memberDetails);
    } catch (err) {
      next(err);
    }
  });
  
  // Lecture routes
  app.post("/api/classrooms/:classroomId/lectures", isTeacher, canAccessClassroom, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.classroomId);
      
      // Check if there's already an active lecture in this classroom
      const activeLecture = await storage.getActiveLectureByClassroom(classroomId);
      if (activeLecture) {
        return res.status(400).json({ message: "There is already an active lecture in this classroom" });
      }
      
      const data = insertLectureSchema.parse({
        ...req.body,
        classroomId,
        createdBy: req.user.id
      });
      
      const lecture = await storage.createLecture(data);
      res.status(201).json(lecture);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/classrooms/:classroomId/lectures", canAccessClassroom, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.classroomId);
      const lectures = await storage.getLecturesByClassroom(classroomId);
      res.json(lectures);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/classrooms/:classroomId/lectures/active", canAccessClassroom, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.classroomId);
      const lecture = await storage.getActiveLectureByClassroom(classroomId);
      
      if (!lecture) {
        return res.status(404).json({ message: "No active lecture found" });
      }
      
      res.json(lecture);
    } catch (err) {
      next(err);
    }
  });
  
  app.post("/api/lectures/:lectureId/end", isTeacher, async (req, res, next) => {
    try {
      const lectureId = parseInt(req.params.lectureId);
      if (isNaN(lectureId)) {
        return res.status(400).json({ message: "Invalid lecture ID" });
      }
      
      const lecture = await storage.getLecture(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Lecture not found" });
      }
      
      // Check if user is the creator of the lecture
      if (lecture.createdBy !== req.user.id) {
        return res.status(403).json({ message: "Forbidden - Not the creator of this lecture" });
      }
      
      const updatedLecture = await storage.endLecture(lectureId);
      res.json(updatedLecture);
    } catch (err) {
      next(err);
    }
  });
  
  // Lecture notes routes
  app.post("/api/lectures/:lectureId/notes", isAuthenticated, async (req, res, next) => {
    try {
      const lectureId = parseInt(req.params.lectureId);
      if (isNaN(lectureId)) {
        return res.status(400).json({ message: "Invalid lecture ID" });
      }
      
      const lecture = await storage.getLecture(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Lecture not found" });
      }
      
      const data = insertLectureNoteSchema.parse({
        ...req.body,
        lectureId
      });
      
      const note = await storage.addLectureNote(data);
      res.status(201).json(note);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/lectures/:lectureId/notes", isAuthenticated, async (req, res, next) => {
    try {
      const lectureId = parseInt(req.params.lectureId);
      if (isNaN(lectureId)) {
        return res.status(400).json({ message: "Invalid lecture ID" });
      }
      
      const lecture = await storage.getLecture(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Lecture not found" });
      }
      
      const notes = await storage.getLectureNotes(lectureId);
      res.json(notes);
    } catch (err) {
      next(err);
    }
  });
  
  // Assignment routes
  app.post("/api/classrooms/:classroomId/assignments", isTeacher, canAccessClassroom, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.classroomId);
      
      const data = insertAssignmentSchema.parse({
        ...req.body,
        classroomId,
        createdBy: req.user.id,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined
      });
      
      const assignment = await storage.createAssignment(data);
      res.status(201).json(assignment);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/classrooms/:classroomId/assignments", canAccessClassroom, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.classroomId);
      const assignments = await storage.getAssignmentsByClassroom(classroomId);
      res.json(assignments);
    } catch (err) {
      next(err);
    }
  });
  
  // Material routes
  app.post("/api/classrooms/:classroomId/materials", isTeacher, canAccessClassroom, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.classroomId);
      
      const data = insertMaterialSchema.parse({
        ...req.body,
        classroomId,
        createdBy: req.user.id
      });
      
      const material = await storage.createMaterial(data);
      res.status(201).json(material);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/classrooms/:classroomId/materials", canAccessClassroom, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.classroomId);
      const materials = await storage.getMaterialsByClassroom(classroomId);
      res.json(materials);
    } catch (err) {
      next(err);
    }
  });
  
  // Messages routes
  app.post("/api/lectures/:lectureId/messages", isAuthenticated, async (req, res, next) => {
    try {
      const lectureId = parseInt(req.params.lectureId);
      if (isNaN(lectureId)) {
        return res.status(400).json({ message: "Invalid lecture ID" });
      }
      
      const lecture = await storage.getLecture(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Lecture not found" });
      }
      
      const data = insertMessageSchema.parse({
        ...req.body,
        lectureId,
        userId: req.user.id
      });
      
      const message = await storage.createMessage(data);
      res.status(201).json(message);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/lectures/:lectureId/messages", isAuthenticated, async (req, res, next) => {
    try {
      const lectureId = parseInt(req.params.lectureId);
      if (isNaN(lectureId)) {
        return res.status(400).json({ message: "Invalid lecture ID" });
      }
      
      const lecture = await storage.getLecture(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Lecture not found" });
      }
      
      const messages = await storage.getMessagesByLecture(lectureId);
      
      // Get user details for each message
      const messagesWithUsers = await Promise.all(
        messages.map(async (message) => {
          const user = await storage.getUser(message.userId);
          if (user) {
            const { password, ...userWithoutPassword } = user;
            return {
              ...message,
              user: userWithoutPassword
            };
          }
          return message;
        })
      );
      
      res.json(messagesWithUsers);
    } catch (err) {
      next(err);
    }
  });

  // Lecture Recording routes
  app.post("/api/lectures/:lectureId/recordings", isTeacher, async (req, res, next) => {
    try {
      const lectureId = parseInt(req.params.lectureId);
      if (isNaN(lectureId)) {
        return res.status(400).json({ message: "Invalid lecture ID" });
      }
      
      const lecture = await storage.getLecture(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Lecture not found" });
      }
      
      // Check if user is the creator of the lecture
      if (lecture.createdBy !== req.user.id) {
        return res.status(403).json({ message: "Forbidden - Not the creator of this lecture" });
      }
      
      const data = insertLectureRecordingSchema.parse({
        ...req.body,
        lectureId,
        createdBy: req.user.id
      });
      
      const recording = await storage.createLectureRecording(data);
      res.status(201).json(recording);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/lectures/:lectureId/recordings", isAuthenticated, async (req, res, next) => {
    try {
      const lectureId = parseInt(req.params.lectureId);
      if (isNaN(lectureId)) {
        return res.status(400).json({ message: "Invalid lecture ID" });
      }
      
      const lecture = await storage.getLecture(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Lecture not found" });
      }
      
      const recordings = await storage.getLectureRecordings(lectureId);
      res.json(recordings);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/recordings/:id", isAuthenticated, async (req, res, next) => {
    try {
      const recordingId = parseInt(req.params.id);
      if (isNaN(recordingId)) {
        return res.status(400).json({ message: "Invalid recording ID" });
      }
      
      const recording = await storage.getLectureRecording(recordingId);
      if (!recording) {
        return res.status(404).json({ message: "Recording not found" });
      }
      
      // Get the lecture to check permissions
      const lecture = await storage.getLecture(recording.lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Associated lecture not found" });
      }
      
      // Check if user is a member of the classroom
      const isUserInClassroom = await storage.isUserInClassroom(req.user.id, lecture.classroomId);
      if (!isUserInClassroom) {
        return res.status(403).json({ message: "Forbidden - Not a member of this classroom" });
      }
      
      res.json(recording);
    } catch (err) {
      next(err);
    }
  });

  const httpServer = createServer(app);

  // Set up WebSocket server
  setupWebSockets(httpServer);

  return httpServer;
}
