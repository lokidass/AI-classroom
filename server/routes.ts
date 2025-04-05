import type { Express } from "express";
import { createServer, type Server } from "http";
// Don't need WebSocketServer import here as it's imported in websocket.ts
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { z } from "zod";
import { 
  insertClassroomSchema, insertLectureSchema, insertAssignmentSchema, 
  insertMaterialSchema, insertMessageSchema, insertLectureNoteSchema, 
  insertClassroomMemberSchema, insertLectureRecordingSchema,
  insertQuizSchema, insertQuizQuestionSchema
} from "@shared/schema";
import { setupWebSockets } from "./websocket";
import { testGeminiApi, listAvailableModels, answerQuestion, generateQuizFromContent } from "./gemini";
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
        role: req.user.role === "teacher" ? "teacher" : "student"
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
  // Get a specific lecture by ID
  app.get("/api/lectures/:lectureId", isAuthenticated, async (req, res, next) => {
    try {
      const lectureId = parseInt(req.params.lectureId);
      if (isNaN(lectureId)) {
        return res.status(400).json({ message: "Invalid lecture ID" });
      }
      
      const lecture = await storage.getLecture(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Lecture not found" });
      }
      
      // Check if user has access to the lecture's classroom
      const classroom = await storage.getClassroom(lecture.classroomId);
      if (!classroom) {
        return res.status(404).json({ message: "Classroom not found" });
      }
      
      const hasAccess = await storage.isUserInClassroom(req.user!.id, lecture.classroomId);
      if (!hasAccess) {
        return res.status(403).json({ message: "You don't have access to this lecture" });
      }
      
      return res.json(lecture);
    } catch (error) {
      next(error);
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
  
  // AI question answering endpoint for lectures
  app.post("/api/lectures/:lectureId/ai-question", isAuthenticated, async (req, res, next) => {
    try {
      const lectureId = parseInt(req.params.lectureId);
      if (isNaN(lectureId)) {
        return res.status(400).json({ message: "Invalid lecture ID" });
      }
      
      const lecture = await storage.getLecture(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: "Lecture not found" });
      }
      
      // Verify user has access to this lecture
      const isUserInClassroom = await storage.isUserInClassroom(req.user!.id, lecture.classroomId);
      if (!isUserInClassroom) {
        return res.status(403).json({ message: "You don't have access to this lecture" });
      }
      
      const { question } = req.body;
      if (!question || typeof question !== 'string') {
        return res.status(400).json({ message: "Valid question is required" });
      }
      
      // Get all lecture notes to provide context for the AI
      const notes = await storage.getLectureNotes(lectureId);
      const lectureContext = notes.map(note => note.content).join("\n\n");
      
      // Call the Gemini API to answer the question
      const answer = await answerQuestion(question, lectureContext);
      
      res.json({ answer });
    } catch (err) {
      console.error("Error in AI question answering:", err);
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
  
  // Quiz routes
  app.post("/api/classrooms/:classroomId/quizzes", isTeacher, canAccessClassroom, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.classroomId);
      
      const data = insertQuizSchema.parse({
        ...req.body,
        classroomId,
        creatorId: req.user!.id,
        contentSource: req.body.content || null
      });
      
      const quiz = await storage.createQuiz(data);
      
      // If content is provided, generate questions using AI
      if (req.body.content && typeof req.body.content === 'string') {
        try {
          // Generate quiz questions using Gemini
          const generatedQuiz = await generateQuizFromContent(req.body.content);
          
          if (generatedQuiz && generatedQuiz.success && Array.isArray(generatedQuiz.questions)) {
            // Store each question in the database
            const savedQuestions = await Promise.all(
              generatedQuiz.questions.map(async (question, index) => {
                const questionData = {
                  quizId: quiz.id,
                  questionText: question.question,
                  options: question.options,
                  correctAnswer: question.options[question.correctOption], // Store the text of the correct answer
                  explanation: question.explanation || null,
                  order: index + 1 // Set the order based on the index
                };
                
                return storage.createQuizQuestion(questionData);
              })
            );
            
            return res.status(201).json({
              quiz,
              questions: savedQuestions
            });
          }
        } catch (aiError) {
          console.error("Error generating quiz questions:", aiError);
          // Continue and return the created quiz without questions
        }
      }
      
      res.status(201).json({ quiz, questions: [] });
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/classrooms/:classroomId/quizzes", canAccessClassroom, async (req, res, next) => {
    try {
      const classroomId = parseInt(req.params.classroomId);
      const quizzes = await storage.getQuizzesByClassroom(classroomId);
      res.json(quizzes);
    } catch (err) {
      next(err);
    }
  });
  
  app.get("/api/quizzes/:quizId", isAuthenticated, async (req, res, next) => {
    try {
      const quizId = parseInt(req.params.quizId);
      if (isNaN(quizId)) {
        return res.status(400).json({ message: "Invalid quiz ID" });
      }
      
      const quiz = await storage.getQuiz(quizId);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }
      
      // Check if user has access to the quiz's classroom
      const isUserInClassroom = await storage.isUserInClassroom(req.user!.id, quiz.classroomId);
      if (!isUserInClassroom) {
        return res.status(403).json({ message: "You don't have access to this quiz" });
      }
      
      // Get questions for this quiz
      const questions = await storage.getQuizQuestions(quizId);
      
      res.json({
        quiz,
        questions
      });
    } catch (err) {
      next(err);
    }
  });
  
  app.post("/api/quizzes/:quizId/responses", isAuthenticated, async (req, res, next) => {
    try {
      const quizId = parseInt(req.params.quizId);
      if (isNaN(quizId)) {
        return res.status(400).json({ message: "Invalid quiz ID" });
      }
      
      const quiz = await storage.getQuiz(quizId);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }
      
      // Check if user has access to the quiz's classroom
      const isUserInClassroom = await storage.isUserInClassroom(req.user!.id, quiz.classroomId);
      if (!isUserInClassroom) {
        return res.status(403).json({ message: "You don't have access to this quiz" });
      }
      
      // Create quiz response
      const quizResponse = await storage.createQuizResponse({
        quizId,
        userId: req.user!.id,
        completed: false,
        score: null,
        completedAt: null
      });
      
      res.status(201).json(quizResponse);
    } catch (err) {
      next(err);
    }
  });
  
  app.post("/api/quiz-responses/:responseId/submit", isAuthenticated, async (req, res, next) => {
    try {
      const responseId = parseInt(req.params.responseId);
      if (isNaN(responseId)) {
        return res.status(400).json({ message: "Invalid response ID" });
      }
      
      const quizResponse = await storage.getQuizResponse(responseId);
      if (!quizResponse) {
        return res.status(404).json({ message: "Quiz response not found" });
      }
      
      // Check if the user is the owner of this response
      if (quizResponse.userId !== req.user!.id) {
        return res.status(403).json({ message: "You don't have permission to submit this response" });
      }
      
      // Validate the answers from the request body
      const { answers } = req.body;
      if (!answers || !Array.isArray(answers)) {
        return res.status(400).json({ message: "Answers must be provided as an array" });
      }
      
      // Get quiz questions
      const questions = await storage.getQuizQuestions(quizResponse.quizId);
      if (questions.length === 0) {
        return res.status(400).json({ message: "This quiz has no questions" });
      }
      
      // Store each answer
      let correctAnswers = 0;
      for (const answer of answers) {
        const questionId = parseInt(answer.questionId);
        const selectedOptionIndex = parseInt(answer.selectedOption);
        
        if (isNaN(questionId) || isNaN(selectedOptionIndex)) {
          continue;
        }
        
        // Find the question
        const question = questions.find(q => q.id === questionId);
        if (!question) {
          continue;
        }
        
        // Get the selected answer text based on the index (if options are available)
        let userAnswer = "";
        if (question.options && Array.isArray(question.options) && 
            selectedOptionIndex >= 0 && selectedOptionIndex < question.options.length) {
          userAnswer = question.options[selectedOptionIndex];
        } else {
          userAnswer = String(selectedOptionIndex); // Fallback to the index itself
        }
        
        // Check if the answer is correct
        const isCorrect = question.correctAnswer === userAnswer;
        if (isCorrect) {
          correctAnswers++;
        }
        
        // Store the response
        await storage.createQuestionResponse({
          quizResponseId: responseId,
          questionId,
          userAnswer,
          isCorrect
        });
      }
      
      // Calculate score as percentage
      const score = questions.length > 0 ? (correctAnswers / questions.length) * 100 : 0;
      
      // Update the quiz response
      const updatedResponse = await storage.updateQuizResponse(responseId, {
        completed: true,
        completedAt: new Date(),
        score
      });
      
      res.json({
        response: updatedResponse,
        correctAnswers,
        totalQuestions: questions.length,
        score
      });
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

  // API Test endpoints
  app.post("/api/test/gemini", async (req, res, next) => {
    try {
      const { prompt, model } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      
      // Use the already imported testGeminiApi function
      const result = await testGeminiApi(prompt, model);
      res.json(result);
    } catch (error) {
      console.error("Error in Gemini API test endpoint:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error",
        stack: process.env.NODE_ENV !== "production" ? error instanceof Error ? error.stack : undefined : undefined
      });
    }
  });
  
  // List available Gemini models endpoint
  app.get("/api/test/gemini/models", async (req, res, next) => {
    try {
      const result = await listAvailableModels();
      res.json(result);
    } catch (error) {
      console.error("Error listing Gemini models:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Unknown error",
        stack: process.env.NODE_ENV !== "production" ? error instanceof Error ? error.stack : undefined : undefined
      });
    }
  });

  const httpServer = createServer(app);

  // Set up WebSocket server
  setupWebSockets(httpServer);

  return httpServer;
}
