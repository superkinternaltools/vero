export type ShiftMode = "fixed" | "open";

export type ShiftWindow = {
  label: string;   // e.g. "Check-in"
  start: string;   // "HH:MM" IST
  end: string;     // "HH:MM" IST (may be < start for overnight)
  graceMin: number;
};

export type PresetRow = {
  id: string;
  name: string;
  mode: ShiftMode;
  windows: ShiftWindow[]; // fixed mode
  punches: number;        // open mode: expected punches/day (in + out = 2)
  midPhotoMin: number;
};

export type RosterRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  overtimeCapHours: number | null;
  holidayDates: string[];
  memberCount: number;
};

export type GridMember = { userId: string; name: string };

export type GridCell = {
  presetId: string | null;
  label: string;          // preset name or custom time range
  mode: ShiftMode;
  windows: ShiftWindow[];
  storeId: string;
  storeName: string;
};

export type RosterGrid = {
  roster: RosterRow;
  weekStart: string;
  days: string[];                                   // 7 ISO dates
  members: GridMember[];
  cells: Record<string, Record<string, GridCell>>;  // userId → date → cell
  presets: PresetRow[];
  stores: { id: string; label: string }[];
};

export type DayStatus =
  | "present"
  | "late"
  | "absent"
  | "left_early"
  | "overtime"
  | "incomplete"
  | "off";

export type PunchDetail = {
  id: string;
  kind: string;
  capturedAt: string;
  photoUrl: string | null;
  geofenceFlag: boolean;
  geofenceDistanceM: number | null;
  noLocationFlag: boolean;
  reviewedAt: string | null;
};

export type LogRow = {
  userId: string;
  name: string;
  storeName: string;
  shiftLabel: string;
  mode: ShiftMode;
  checkIn: string | null;   // "HH:MM" IST
  checkOut: string | null;
  workedMinutes: number | null;
  overtimeMinutes: number;
  status: DayStatus;
  flags: string[];          // "geo" | "no_gps"
  referencePhoto: string | null;
  punches: PunchDetail[];
};

export type AttendanceLog = {
  date: string;
  rows: LogRow[];
  summary: { expected: number; present: number; late: number; absent: number; flagged: number };
};

export type WeeklyRow = {
  userId: string;
  name: string;
  present: number;
  expected: number;
  late: number;
  absent: number;
  workedMinutes: number;
  overtimeMinutes: number;
  avgIn: string | null;
  avgOut: string | null;
  perDayMinutes: number[]; // 7 entries
};

export type PunchContext = {
  date: string;
  /** True when this is actually yesterday's still-open shift (overnight
   * shift crossing midnight), not today's own assignment. */
  carriedOver: boolean;
  hasReference: boolean;
  assignment: {
    assignmentId: string;
    rosterId: string;
    storeId: string;
    storeName: string;
    mode: ShiftMode;
    windows: ShiftWindow[];
    midPhotoMin: number;
  } | null;
  punches: { kind: string; capturedAt: string }[];
};
