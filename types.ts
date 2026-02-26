type SourceType = "group" | "lecturer" | "room";

interface Lesson {
  number: number;
  bells: string;
  subgroup: number;
  name?: string;
  lecturer?: string;
  group?: string;
  room?: string;
}
export interface Day {
  date: string;
  weekday: string;
  lessons: Lesson[];
}
interface KitisRecord {
  number: number;
  lecturer: string;
  group: string;
  subgroup: number;
  name: string;
  journal_number: number;
  lesson_type: string;
  hours: {
    semester: {
      total: number;
      planned: number;
      actual: number;
      remaining: number;
    };
    week: {
      planned: number;
      actual: number;
    };
  };
  end_date: string;
  progress: number;
}
interface JournalRecord {
  number: number;
  date: string;
  lesson_number: number;
  group: string;
  subgroup: number;
  lecturer: string;
  room: string;
}

export interface ResponseStatus {
  status: number;
  text: string;
  elapsed: number;
}
export interface ResponseSchedule {
  source_type: SourceType;
  source: string;
  last_modified: number; // unix timestamp in seconds
  days: Day[];
}
export interface ResponseRecords {
  source_type: SourceType;
  source: string;
  last_modified: number; // unix timestamp in seconds
  records: KitisRecord[];
}
export interface ResponseJournal {
  journal_number: number;
  lesson_name: string;
  date: string;
  last_modified: number; // unix timestamp in seconds
  records: JournalRecord[];
}
