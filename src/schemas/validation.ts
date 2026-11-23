import { z } from 'zod';

const idRegex = /^[a-zA-Z0-9_-]+$/;

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address').max(200),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

export const registerSchema = z.object({
  displayName: z.string().min(2, 'Full name is required').max(120),
  email: z.string().email('Enter a valid campus email').max(200),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  departmentId: z.string().min(1, 'Select a department').regex(idRegex),
  studentIdCode: z.string().max(64).optional(),
  requestElevatedRole: z.boolean().optional(),
  requestedRole: z.enum(['faculty', 'admin']).optional(),
  justification: z.string().max(1000).optional(),
});

export const projectSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(160),
  description: z.string().min(5, 'Description must be at least 5 characters').max(2000),
  category: z.string().min(2, 'Category is required').max(80),
  departmentId: z.string().min(1, 'Department is required').regex(idRegex),
  teamMembers: z.array(z.string().max(120)).max(20).optional(),
  equipmentRequirements: z.string().max(1000).optional(),
  startDate: z.string().min(4, 'Start date is required').max(64),
  deadline: z.string().min(4, 'Deadline is required').max(64),
  deadlineType: z.enum(['exact', 'end_of_day']).optional(),
  estimatedHours: z.coerce.number().min(0.5).max(500).optional(),
  priorityJustification: z.string().max(1000).optional(),
  attachmentName: z.string().max(255).optional(),
});

export const bookingRequestSchema = z.object({
  projectId: z.string().min(1, 'Select a project').regex(idRegex),
  equipmentId: z.string().min(1, 'Equipment is required').regex(idRegex),
  requestedStart: z.string().min(10, 'Start time is required').max(64),
  requestedEnd: z.string().min(10, 'End time is required').max(64),
  units: z.coerce.number().int().min(1).max(50),
  purpose: z.string().max(1000).optional(),
  requiredCuda: z.boolean().optional(),
  requiredVramGB: z.coerce.number().min(0).max(1024).optional(),
});

export const equipmentSchema = z.object({
  equipmentId: z.string().min(2).max(40).regex(idRegex, 'Use letters, numbers, hyphens, or underscores'),
  name: z.string().min(2).max(160),
  category: z.enum([
    'GPU Workstation',
    'Robotics',
    'Embedded & IoT',
    '3D Printing',
    'Electronics & Test',
    'FPGA & Hardware',
    'Networking',
    'Research Instrument',
  ]),
  description: z.string().min(5).max(2000),
  departmentId: z.string().min(1).regex(idRegex),
  laboratoryId: z.string().min(1).regex(idRegex),
  building: z.string().min(1).max(120),
  location: z.string().min(1).max(160),
  quantity: z.coerce.number().int().min(0).max(500),
  condition: z.enum(['excellent', 'good', 'fair', 'needs_service']),
  maintenanceStatus: z.enum(['operational', 'scheduled', 'under_maintenance']),
  responsibleFacultyId: z.string().min(1).regex(idRegex),
  minBookingMins: z.coerce.number().int().min(15).max(720),
  maxBookingMins: z.coerce.number().int().min(30).max(1440),
  usageRestrictions: z.string().max(1000).optional(),
  requiresCertification: z.boolean(),
  requiredCertification: z.string().max(120).optional(),
  allowsSplitBooking: z.boolean(),
  isActive: z.boolean(),
  imageUrl: z.string().max(500),
  specs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.undefined()])),
});

export const departmentSchema = z.object({
  code: z.string().min(2).max(16),
  name: z.string().min(2).max(120),
  building: z.string().min(1).max(120),
  headFacultyId: z.string().max(128).optional(),
});

export const laboratorySchema = z.object({
  name: z.string().min(2).max(120),
  departmentId: z.string().min(1).regex(idRegex),
  building: z.string().min(1).max(120),
  room: z.string().min(1).max(64),
  openHour: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/, 'Use HH:MM format'),
  closeHour: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/, 'Use HH:MM format'),
  facultyInChargeId: z.string().min(1).regex(idRegex),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
});

export const maintenanceSchema = z.object({
  equipmentId: z.string().min(1).regex(idRegex),
  title: z.string().min(2).max(160),
  description: z.string().max(1000).optional(),
  start: z.string().min(10).max(64),
  end: z.string().min(10).max(64),
  technician: z.string().max(120).optional(),
});

export const weightsSchema = z.object({
  deadline: z.number().min(0).max(1),
  necessity: z.number().min(0).max(1),
  fairness: z.number().min(0).max(1),
  feasibility: z.number().min(0).max(1),
  waiting: z.number().min(0).max(1),
});

export const nlSearchFilterSchema = z.object({
  categories: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  minVramGB: z.number().nullable().optional(),
  requiresCuda: z.boolean().nullable().optional(),
  availableOnly: z.boolean().default(false),
  departmentName: z.string().nullable().optional(),
  timeWindowStart: z.string().nullable().optional(),
  timeWindowEnd: z.string().nullable().optional(),
});

export type NLSearchFilter = z.infer<typeof nlSearchFilterSchema>;
