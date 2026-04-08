export const BA_OPTIONS = ['Patricia', 'JR', 'ERMS', 'Joyce'];

export const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning', color: '#6366f1' },
  { value: 'inprogress', label: 'In Progress', color: '#f59e0b' },
  { value: 'development', label: 'Development', color: '#3b82f6' },
  { value: 'testing', label: 'Testing', color: '#8b5cf6' },
  { value: 'launched', label: 'Launched', color: '#10b981' },
  { value: 'onhold', label: 'On Hold', color: '#ef4444' },
];

export const BUG_CRITERIA = [
  {
    value: 'new_requirements',
    label: 'New Requirements',
    color: '#3b82f6',
    description: 'Requirements discovered during development not in original spec'
  },
  {
    value: 'missed_requirements',
    label: 'Missed Requirements',
    color: '#f59e0b',
    description: 'Features or functionality missed from initial requirements'
  },
  {
    value: 'code_logic_issue',
    label: 'Code Logic Issue',
    color: '#ef4444',
    description: 'Bug in code implementation or logic'
  },
  {
    value: 'known_issue',
    label: 'Known Issue',
    color: '#6366f1',
    description: 'Pre-identified issue documented and accepted'
  },
  {
    value: 'affected_by_dev',
    label: 'Affected by Dev',
    color: '#8b5cf6',
    description: 'Issue caused by changes from other development work'
  },
];

export const BUG_SEVERITY = [
  { value: 'critical', label: 'Critical', color: '#ef4444' },
  { value: 'high', label: 'High', color: '#f97316' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'low', label: 'Low', color: '#10b981' },
];

export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

export const QUARTER_MONTHS = {
  Q1: 'Jan - Mar',
  Q2: 'Apr - Jun',
  Q3: 'Jul - Sep',
  Q4: 'Oct - Dec',
};

export const SPRINTS = Array.from({ length: 26 }, (_, i) => `Sprint ${i + 1}`);

// Returns display label for sprint range, e.g. "Sprint 9 - Sprint 10" or "Sprint 5"
export const getSprintLabel = (brd) => {
  if (!brd) return '—';
  const start = brd.sprintStart || brd.sprint || '—';
  const end = brd.sprintEnd;
  if (end && end !== start) return `${start} - ${end}`;
  return start;
};

export const CURRENT_YEAR = new Date().getFullYear();
export const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

export const MIN_BUG_THRESHOLD = 3; // minimal bugs = success

// 1 sprint = 4 weeks = 20 working days
export const SPRINT_DAYS = 20;

export const TSHIRT_SIZES = [
  {
    value: 'XS',
    label: 'XS',
    sprint: '< 0.5 sprint',
    days: '< 10 days',
    description: 'Very small feature. Minimal effort, very low risk. No dependencies.',
    risk: 'Very Low',
    color: '#10b981',
    bg: 'bg-emerald-100 dark:bg-emerald-950',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-300 dark:ring-emerald-700',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  {
    value: 'S',
    label: 'S',
    sprint: '≤ 1 sprint',
    days: '≤ 20 days',
    description: 'Simple and isolated task. Clear scope. Might require 1–2 people.',
    risk: 'Low',
    color: '#3b82f6',
    bg: 'bg-blue-100 dark:bg-blue-950',
    text: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-300 dark:ring-blue-700',
    border: 'border-blue-200 dark:border-blue-800',
  },
  {
    value: 'M',
    label: 'M',
    sprint: '1–2 sprints',
    days: '20–40 days',
    description: 'Moderate effort. Might require collaboration across team members. Some complexity or testing.',
    risk: 'Medium',
    color: '#f59e0b',
    bg: 'bg-amber-100 dark:bg-amber-950',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-300 dark:ring-amber-700',
    border: 'border-amber-200 dark:border-amber-800',
  },
  {
    value: 'L',
    label: 'L',
    sprint: '2–3 sprints',
    days: '40–60 days',
    description: 'Complex features. Cross-functional work. May involve back-end, front-end, QA, or coordination. Moderate risk.',
    risk: 'Moderate',
    color: '#f97316',
    bg: 'bg-orange-100 dark:bg-orange-950',
    text: 'text-orange-700 dark:text-orange-300',
    ring: 'ring-orange-300 dark:ring-orange-700',
    border: 'border-orange-200 dark:border-orange-800',
  },
  {
    value: 'XL',
    label: 'XL',
    sprint: '3–5 sprints',
    days: '60–100 days',
    description: 'Large initiative. Many moving parts or dependencies. Needs coordination across teams. Higher risk.',
    risk: 'High',
    color: '#ef4444',
    bg: 'bg-red-100 dark:bg-red-950',
    text: 'text-red-700 dark:text-red-300',
    ring: 'ring-red-300 dark:ring-red-700',
    border: 'border-red-200 dark:border-red-800',
  },
  {
    value: 'XXL',
    label: 'XXL',
    sprint: '5+ sprints',
    days: '100+ days',
    description: 'Epic-level work. Needs to be broken down. Too big to plan effectively as-is. High uncertainty.',
    risk: 'Very High',
    color: '#7c3aed',
    bg: 'bg-violet-100 dark:bg-violet-950',
    text: 'text-violet-700 dark:text-violet-300',
    ring: 'ring-violet-300 dark:ring-violet-700',
    border: 'border-violet-200 dark:border-violet-800',
  },
];

export const getTShirtSize = (value) => TSHIRT_SIZES.find((s) => s.value === value) || null;

export const getBugCriteria = (value) => BUG_CRITERIA.find((c) => c.value === value) || null;

export const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
};
