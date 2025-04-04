import {
  users, type User, type InsertUser,
  classrooms, type Classroom, type InsertClassroom,
  classroomMembers, type ClassroomMember, type InsertClassroomMember,
  lectures, type Lecture, type InsertLecture,
  lectureNotes, type LectureNote, type InsertLectureNote,
  assignments, type Assignment, type InsertAssignment,
  materials, type Material, type InsertMaterial,
  messages, type Message, type InsertMessage
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

// Define the storage interface with all CRUD methods
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Classroom operations
  createClassroom(classroom: InsertClassroom): Promise<Classroom>;
  getClassroom(id: number): Promise<Classroom | undefined>;
  getClassroomByCode(code: string): Promise<Classroom | undefined>;
  getClassroomsByUser(userId: number): Promise<Classroom[]>;
  updateClassroom(id: number, data: Partial<Classroom>): Promise<Classroom | undefined>;
  deleteClassroom(id: number): Promise<boolean>;
  
  // Classroom membership operations
  addMemberToClassroom(member: InsertClassroomMember): Promise<ClassroomMember>;
  getClassroomMembers(classroomId: number): Promise<ClassroomMember[]>;
  isUserInClassroom(userId: number, classroomId: number): Promise<boolean>;
  
  // Lecture operations
  createLecture(lecture: InsertLecture): Promise<Lecture>;
  getLecture(id: number): Promise<Lecture | undefined>;
  getActiveLectureByClassroom(classroomId: number): Promise<Lecture | undefined>;
  getLecturesByClassroom(classroomId: number): Promise<Lecture[]>;
  updateLecture(id: number, data: Partial<Lecture>): Promise<Lecture | undefined>;
  endLecture(id: number): Promise<Lecture | undefined>;
  
  // Lecture notes operations
  addLectureNote(note: InsertLectureNote): Promise<LectureNote>;
  getLectureNotes(lectureId: number): Promise<LectureNote[]>;
  
  // Assignment operations
  createAssignment(assignment: InsertAssignment): Promise<Assignment>;
  getAssignment(id: number): Promise<Assignment | undefined>;
  getAssignmentsByClassroom(classroomId: number): Promise<Assignment[]>;
  
  // Material operations
  createMaterial(material: InsertMaterial): Promise<Material>;
  getMaterial(id: number): Promise<Material | undefined>;
  getMaterialsByClassroom(classroomId: number): Promise<Material[]>;
  
  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByLecture(lectureId: number): Promise<Message[]>;
  
  // Session store
  sessionStore: session.SessionStore;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private classrooms: Map<number, Classroom>;
  private classroomMembers: Map<number, ClassroomMember>;
  private lectures: Map<number, Lecture>;
  private lectureNotes: Map<number, LectureNote>;
  private assignments: Map<number, Assignment>;
  private materials: Map<number, Material>;
  private messages: Map<number, Message>;
  
  public sessionStore: session.SessionStore;
  
  // Counters for auto-incrementing IDs
  private userIdCounter: number;
  private classroomIdCounter: number;
  private classroomMemberIdCounter: number;
  private lectureIdCounter: number;
  private lectureNoteIdCounter: number;
  private assignmentIdCounter: number;
  private materialIdCounter: number;
  private messageIdCounter: number;

  constructor() {
    this.users = new Map();
    this.classrooms = new Map();
    this.classroomMembers = new Map();
    this.lectures = new Map();
    this.lectureNotes = new Map();
    this.assignments = new Map();
    this.materials = new Map();
    this.messages = new Map();
    
    this.userIdCounter = 1;
    this.classroomIdCounter = 1;
    this.classroomMemberIdCounter = 1;
    this.lectureIdCounter = 1;
    this.lectureNoteIdCounter = 1;
    this.assignmentIdCounter = 1;
    this.materialIdCounter = 1;
    this.messageIdCounter = 1;
    
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: now
    };
    this.users.set(id, user);
    return user;
  }
  
  // Classroom operations
  async createClassroom(insertClassroom: InsertClassroom): Promise<Classroom> {
    const id = this.classroomIdCounter++;
    const now = new Date();
    const classroom: Classroom = {
      ...insertClassroom,
      id,
      createdAt: now
    };
    this.classrooms.set(id, classroom);
    return classroom;
  }
  
  async getClassroom(id: number): Promise<Classroom | undefined> {
    return this.classrooms.get(id);
  }
  
  async getClassroomByCode(code: string): Promise<Classroom | undefined> {
    return Array.from(this.classrooms.values()).find(
      (classroom) => classroom.code === code
    );
  }
  
  async getClassroomsByUser(userId: number): Promise<Classroom[]> {
    // Get the classroom IDs this user is a member of
    const memberClassroomIds = Array.from(this.classroomMembers.values())
      .filter(member => member.userId === userId)
      .map(member => member.classroomId);
    
    // Get the classrooms created by this user
    const createdClassrooms = Array.from(this.classrooms.values())
      .filter(classroom => classroom.createdBy === userId);
    
    // Get the classrooms this user is a member of
    const memberClassrooms = Array.from(this.classrooms.values())
      .filter(classroom => memberClassroomIds.includes(classroom.id));
    
    // Combine and deduplicate
    const allClassrooms = [...createdClassrooms, ...memberClassrooms];
    const uniqueClassrooms = Array.from(
      new Map(allClassrooms.map(classroom => [classroom.id, classroom])).values()
    );
    
    return uniqueClassrooms;
  }
  
  async updateClassroom(id: number, data: Partial<Classroom>): Promise<Classroom | undefined> {
    const classroom = this.classrooms.get(id);
    if (!classroom) return undefined;
    
    const updatedClassroom = { ...classroom, ...data };
    this.classrooms.set(id, updatedClassroom);
    return updatedClassroom;
  }
  
  async deleteClassroom(id: number): Promise<boolean> {
    return this.classrooms.delete(id);
  }
  
  // Classroom membership operations
  async addMemberToClassroom(insertMember: InsertClassroomMember): Promise<ClassroomMember> {
    const id = this.classroomMemberIdCounter++;
    const now = new Date();
    const member: ClassroomMember = {
      ...insertMember,
      id,
      joinedAt: now
    };
    this.classroomMembers.set(id, member);
    return member;
  }
  
  async getClassroomMembers(classroomId: number): Promise<ClassroomMember[]> {
    return Array.from(this.classroomMembers.values())
      .filter(member => member.classroomId === classroomId);
  }
  
  async isUserInClassroom(userId: number, classroomId: number): Promise<boolean> {
    // Check if user created the classroom
    const classroom = await this.getClassroom(classroomId);
    if (classroom && classroom.createdBy === userId) return true;
    
    // Check if user is a member of the classroom
    const members = await this.getClassroomMembers(classroomId);
    return members.some(member => member.userId === userId);
  }
  
  // Lecture operations
  async createLecture(insertLecture: InsertLecture): Promise<Lecture> {
    const id = this.lectureIdCounter++;
    const now = new Date();
    const lecture: Lecture = {
      ...insertLecture,
      id,
      startTime: now,
      endTime: null,
      isActive: true
    };
    this.lectures.set(id, lecture);
    return lecture;
  }
  
  async getLecture(id: number): Promise<Lecture | undefined> {
    return this.lectures.get(id);
  }
  
  async getActiveLectureByClassroom(classroomId: number): Promise<Lecture | undefined> {
    return Array.from(this.lectures.values()).find(
      lecture => lecture.classroomId === classroomId && lecture.isActive
    );
  }
  
  async getLecturesByClassroom(classroomId: number): Promise<Lecture[]> {
    return Array.from(this.lectures.values())
      .filter(lecture => lecture.classroomId === classroomId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }
  
  async updateLecture(id: number, data: Partial<Lecture>): Promise<Lecture | undefined> {
    const lecture = this.lectures.get(id);
    if (!lecture) return undefined;
    
    const updatedLecture = { ...lecture, ...data };
    this.lectures.set(id, updatedLecture);
    return updatedLecture;
  }
  
  async endLecture(id: number): Promise<Lecture | undefined> {
    const lecture = this.lectures.get(id);
    if (!lecture) return undefined;
    
    const now = new Date();
    const updatedLecture = { ...lecture, isActive: false, endTime: now };
    this.lectures.set(id, updatedLecture);
    return updatedLecture;
  }
  
  // Lecture notes operations
  async addLectureNote(insertNote: InsertLectureNote): Promise<LectureNote> {
    const id = this.lectureNoteIdCounter++;
    const now = new Date();
    const note: LectureNote = {
      ...insertNote,
      id,
      timestamp: now
    };
    this.lectureNotes.set(id, note);
    return note;
  }
  
  async getLectureNotes(lectureId: number): Promise<LectureNote[]> {
    return Array.from(this.lectureNotes.values())
      .filter(note => note.lectureId === lectureId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  
  // Assignment operations
  async createAssignment(insertAssignment: InsertAssignment): Promise<Assignment> {
    const id = this.assignmentIdCounter++;
    const now = new Date();
    const assignment: Assignment = {
      ...insertAssignment,
      id,
      createdAt: now
    };
    this.assignments.set(id, assignment);
    return assignment;
  }
  
  async getAssignment(id: number): Promise<Assignment | undefined> {
    return this.assignments.get(id);
  }
  
  async getAssignmentsByClassroom(classroomId: number): Promise<Assignment[]> {
    return Array.from(this.assignments.values())
      .filter(assignment => assignment.classroomId === classroomId)
      .sort((a, b) => {
        // Sort by due date, null due dates come last
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.getTime() - b.dueDate.getTime();
      });
  }
  
  // Material operations
  async createMaterial(insertMaterial: InsertMaterial): Promise<Material> {
    const id = this.materialIdCounter++;
    const now = new Date();
    const material: Material = {
      ...insertMaterial,
      id,
      createdAt: now
    };
    this.materials.set(id, material);
    return material;
  }
  
  async getMaterial(id: number): Promise<Material | undefined> {
    return this.materials.get(id);
  }
  
  async getMaterialsByClassroom(classroomId: number): Promise<Material[]> {
    return Array.from(this.materials.values())
      .filter(material => material.classroomId === classroomId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  // Message operations
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.messageIdCounter++;
    const now = new Date();
    const message: Message = {
      ...insertMessage,
      id,
      timestamp: now
    };
    this.messages.set(id, message);
    return message;
  }
  
  async getMessagesByLecture(lectureId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => message.lectureId === lectureId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

export const storage = new MemStorage();
