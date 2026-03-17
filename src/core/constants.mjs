export const LOOKUP_URL =
  'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/lookup';
export const GET_QUESTIONS_URL =
  'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-questions';
export const PDF_DOWNLOAD_URL =
  'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/pdf-download';
export const LEGACY_DISCLOSED_BASE_URL = 'https://saic.collegeboard.org/disclosed';

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
  outputDir: './output',
  excludeActive: false,
  excludeExported: false,
  shuffle: true,
  fromPage: 1,
  toPage: null,
  headed: false,
};
