export const EXPORT_MODES = {
  student: 'student',
  teacher: 'teacher',
  clean: 'clean',
};

export const DIFFICULTY_CODES = {
  easy: 'E',
  medium: 'M',
  hard: 'H',
  e: 'E',
  m: 'M',
  h: 'H',
};

export const DEFAULT_EXPORT_OPTIONS = {
  assessment: 'SAT',
  section: 'Math',
  domains: [],
  skills: [],
  difficulty: [],
  questionCount: 20,
  chunkSize: 20,
  mode: EXPORT_MODES.student,
  includeAnswerKey: false,
  outputDir: './output',
  excludeActive: false,
  excludeExported: false,
  shuffle: true,
  fromPage: 1,
  toPage: null,
  headed: false,
};
