export type UserRole = 'student' | 'faculty' | 'admin';

export type BookingRequestStatus =
  | 'draft'
  | 'submitted'
  | 'pending_approval'
  | 'ai_recommended'
  | 'approved'
  | 'rejected'
  | 'waitlisted'
  | 'cancelled'
  | 'completed';

export type BookingStatus = 'approved' | 'checked_in' | 'completed' | 'cancelled';

export type ConstraintCode =
  | 'EQUIPMENT_INACTIVE'
  | 'EQUIPMENT_UNAVAILABLE'
  | 'MAINTENANCE_OVERLAP'
  | 'OUTSIDE_LAB_HOURS'
  | 'OVERLAPS_CONFIRMED_BOOKING'
  | 'EXCEEDS_MAX_DURATION'
  | 'BELOW_MIN_DURATION'
  | 'INVALID_TIME_RANGE'
  | 'SPEC_MISMATCH'
  | 'ACCESS_NOT_PERMITTED'
  | 'SAFETY_RESTRICTION'
  | 'DEADLINE_BEFORE_SLOT_END';

export interface BaseDoc {
  id: string;
  status: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile extends BaseDoc {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  departmentId: string;
  departmentApproved: boolean;
  certifications?: string[];
  studentIdCode?: string;
  phone?: string;
  status: 'active' | 'suspended';
}

export interface RoleRequest extends BaseDoc {
  userId: string;
  email: string;
  displayName: string;
  requestedRole: 'faculty' | 'admin';
  departmentId: string;
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
}

export interface Department extends BaseDoc {
  code: string;
  name: string;
  building: string;
  headFacultyId?: string;
  status: 'active' | 'inactive';
}

export interface Laboratory extends BaseDoc {
  name: string;
  departmentId: string;
  building: string;
  room: string;
  openHour: string;
  closeHour: string;
  facultyInChargeId: string;
  capacity?: number;
  status: 'active' | 'inactive';
}

export type EquipmentCategory =
  | 'GPU Workstation'
  | 'Robotics'
  | 'Embedded & IoT'
  | '3D Printing'
  | 'Electronics & Test'
  | 'FPGA & Hardware'
  | 'Networking'
  | 'Research Instrument';

export interface EquipmentSpecs {
  cuda?: boolean;
  vramGB?: number;
  cores?: number;
  ramGB?: number;
  architecture?: string;
  precision?: string;
  channels?: number;
  bandwidthMHz?: number;
  buildVolumeMm?: string;
  payloadKg?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface Equipment extends BaseDoc {
  equipmentId: string;
  name: string;
  category: EquipmentCategory;
  description: string;
  specs: EquipmentSpecs;
  departmentId: string;
  laboratoryId: string;
  building: string;
  location: string;
  quantity: number;
  condition: 'excellent' | 'good' | 'fair' | 'needs_service';
  maintenanceStatus: 'operational' | 'scheduled' | 'under_maintenance';
  responsibleFacultyId: string;
  minBookingMins: number;
  maxBookingMins: number;
  usageRestrictions?: string;
  requiresCertification: boolean;
  requiredCertification?: string;
  allowsSplitBooking: boolean;
  isActive: boolean;
  status: 'active' | 'inactive' | 'maintenance';
  imageUrl: string;
}

export interface Project extends BaseDoc {
  ownerId: string;
  departmentId: string;
  title: string;
  description: string;
  category: string;
  teamMembers?: string[];
  equipmentRequirements?: string;
  startDate: string;
  deadline: string;
  deadlineType?: 'exact' | 'end_of_day';
  estimatedHours?: number;
  priorityJustification?: string;
  attachmentName?: string;
  status: 'active' | 'completed' | 'archived';
}

export interface TimeSlot {
  start: string;
  end: string;
  equipmentId?: string;
  equipmentName?: string;
}

export interface BookingRequest extends BaseDoc {
  studentId: string;
  projectId: string;
  equipmentId: string;
  departmentId: string;
  requestedStart: string;
  requestedEnd: string;
  units: number;
  requiredSpecs?: Partial<EquipmentSpecs>;
  purpose?: string;
  status: BookingRequestStatus;
  aiScore?: number;
  aiRecommendedSlot?: TimeSlot | null;
  facultyNote?: string;
  submittedAt: string;
}

export interface Booking extends BaseDoc {
  requestId: string;
  studentId: string;
  projectId: string;
  equipmentId: string;
  departmentId: string;
  start: string;
  end: string;
  units: number;
  status: BookingStatus;
  qrToken?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  maintenanceConflict?: boolean;
  approvedBy?: string;
}

export interface Approval extends BaseDoc {
  requestId: string;
  facultyId: string;
  decision: 'approved' | 'modified' | 'rejected' | 'suggested_alternative' | 'more_info_requested';
  isOverride: boolean;
  reason?: string;
  engineSnapshot?: {
    rank: number | null;
    totalScore: number;
    recommendedSlot: TimeSlot | null;
  };
  status: 'recorded';
}

export interface MaintenanceRecord extends BaseDoc {
  equipmentId: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  technician?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

export interface NotificationItem extends BaseDoc {
  userId: string;
  type:
    | 'request_submitted'
    | 'request_approved'
    | 'request_rejected'
    | 'alternative_suggested'
    | 'more_info_requested'
    | 'booking_reminder'
    | 'maintenance_alert'
    | 'waitlist_freed'
    | 'role_updated';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  status: 'unread' | 'read';
}

export interface UsageLog extends BaseDoc {
  studentId: string;
  equipmentId: string;
  bookingId?: string;
  hours: number;
  loggedAt: string;
  status: 'logged';
}

export interface WaitlistEntry extends BaseDoc {
  requestId: string;
  studentId: string;
  equipmentId: string;
  desiredStart: string;
  desiredEnd: string;
  fairnessScore: number;
  status: 'waiting' | 'notified' | 'fulfilled' | 'cancelled';
}

export interface AllocationWeights {
  deadline: number;
  necessity: number;
  fairness: number;
  feasibility: number;
  waiting: number;
}

export interface SettingsDoc extends BaseDoc {
  weights?: AllocationWeights;
  fairUseLimitHours?: number;
  enforceFairUseHard?: boolean;
  enabled?: boolean;
  defaultLabOpenHour?: string;
  defaultLabCloseHour?: string;
  status: 'active';
}

export interface ScheduleInterval {
  bookingId: string;
  start: string;
  end: string;
  units: number;
}

export interface EquipmentDaySchedule extends BaseDoc {
  equipmentId: string;
  date: string; // YYYY-MM-DD
  intervals: ScheduleInterval[];
  status: 'active';
}

export interface AuditLog extends BaseDoc {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  status: 'recorded';
}

// --- Engine Output Types ---
export interface ConstraintCheck {
  code: ConstraintCode;
  passed: boolean;
  detail: string;
}

export interface FactorScore {
  rawInput: string | number;
  score: number; // 0-100
  weight: number; // normalized 0-1
  weighted: number;
}

export interface ScoreBreakdown {
  deadline: FactorScore;
  necessity: FactorScore;
  fairness: FactorScore;
  feasibility: FactorScore;
  waiting: FactorScore;
  total: number;
}

export interface AlternativeSlotOption {
  start: string;
  end: string;
  equipmentId: string;
  reason: string;
}

export interface AlternativeEquipmentOption {
  equipmentId: string;
  equipmentCode: string;
  name: string;
  category: string;
  building: string;
  laboratoryName: string;
  sameDepartment: boolean;
  specMatchScore: number;
  start: string;
  end: string;
  reason: string;
}

export interface SplitBookingOption {
  segments: Array<{ start: string; end: string }>;
  totalMins: number;
  reason: string;
}

export interface RequestAlternatives {
  sameEquipmentSlots: AlternativeSlotOption[];
  alternativeEquipment: AlternativeEquipmentOption[];
  nearbyLabs: AlternativeEquipmentOption[];
  splitOptions: SplitBookingOption[];
  waitlistEligible: {
    eligible: boolean;
    fairnessScore: number;
    reason: string;
  };
}

export interface AllocationRequestResult {
  requestId: string;
  studentId: string;
  projectId: string;
  equipmentId: string;
  eligibility: 'ELIGIBLE' | 'INELIGIBLE';
  constraintChecks: ConstraintCheck[];
  scoreBreakdown: ScoreBreakdown | null;
  rank: number | null;
  recommendedSlot: TimeSlot | null;
  alternatives: RequestAlternatives;
  flags: string[];
  reasons: string[];
}

export interface ConflictGroupSummary {
  equipmentId: string;
  date: string;
  requestIds: string[];
  hasConflict: boolean;
}

export interface AllocationResult extends BaseDoc {
  equipmentId: string;
  date: string;
  engineVersion: string;
  weightsUsed: AllocationWeights;
  requestIds: string[];
  entries: AllocationRequestResult[];
  conflictGroups: ConflictGroupSummary[];
  computedAt: string;
  status: 'active' | 'superseded';
}

export interface WhatIfDiffItem {
  requestId: string;
  baselineRank: number | null;
  simulatedRank: number | null;
  baselineScore: number;
  simulatedScore: number;
  baselineSlot: TimeSlot | null;
  simulatedSlot: TimeSlot | null;
  summary: string;
}

export interface WhatIfResult {
  baseline: AllocationResult;
  simulated: AllocationResult;
  diffs: WhatIfDiffItem[];
}
