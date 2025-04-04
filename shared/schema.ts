import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull().default("student"), // "teacher" or "student"
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  fullName: true,
  role: true,
  avatar: true,
});

// Classroom schema
export const classrooms = pgTable("classrooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  code: text("code").notNull().unique(), // Unique code for joining classroom
  createdBy: integer("created_by").notNull(), // User ID of the teacher
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClassroomSchema = createInsertSchema(classrooms).pick({
  name: true,
  description: true,
  code: true,
  createdBy: true,
});

// Classroom membership
export const classroomMembers = pgTable("classroom_members", {
  id: serial("id").primaryKey(),
  classroomId: integer("classroom_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull().default("student"), // "teacher" or "student"
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const insertClassroomMemberSchema = createInsertSchema(classroomMembers).pick({
  classroomId: true,
  userId: true,
  role: true,
});

// Lecture schema
export const lectures = pgTable("lectures", {
  id: serial("id").primaryKey(),
  classroomId: integer("classroom_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").defaultNow(),
  endTime: timestamp("end_time"),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").notNull(),
});

export const insertLectureSchema = createInsertSchema(lectures).pick({
  classroomId: true,
  title: true,
  description: true,
  createdBy: true,
});

// Lecture notes schema
export const lectureNotes = pgTable("lecture_notes", {
  id: serial("id").primaryKey(),
  lectureId: integer("lecture_id").notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertLectureNoteSchema = createInsertSchema(lectureNotes).pick({
  lectureId: true,
  content: true,
});

// Assignment schema
export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  classroomId: integer("classroom_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAssignmentSchema = createInsertSchema(assignments).pick({
  classroomId: true,
  title: true,
  description: true,
  dueDate: true,
  createdBy: true,
});

// Material schema
export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  classroomId: integer("classroom_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  type: text("type").default("document"), // "document", "video", "link", etc.
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMaterialSchema = createInsertSchema(materials).pick({
  classroomId: true,
  title: true,
  description: true,
  url: true,
  type: true,
  createdBy: true,
});

// Message schema for chats during lectures
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  lectureId: integer("lecture_id").notNull(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  lectureId: true,
  userId: true,
  content: true,
});

// Define WebSocket message types
export type WebSocketMessage = {
  type: string;
  payload: any;
};

// Define User type
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Define Classroom types
export type Classroom = typeof classrooms.$inferSelect;
export type InsertClassroom = z.infer<typeof insertClassroomSchema>;

// Define ClassroomMember types
export type ClassroomMember = typeof classroomMembers.$inferSelect;
export type InsertClassroomMember = z.infer<typeof insertClassroomMemberSchema>;

// Define Lecture types
export type Lecture = typeof lectures.$inferSelect;
export type InsertLecture = z.infer<typeof insertLectureSchema>;

// Define LectureNote types
export type LectureNote = typeof lectureNotes.$inferSelect;
export type InsertLectureNote = z.infer<typeof insertLectureNoteSchema>;

// Define Assignment types
export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;

// Define Material types
export type Material = typeof materials.$inferSelect;
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;

// Define Message types
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
