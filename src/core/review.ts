export type ReviewStatus = 'pending' | 'approved' | 'changes_requested';

export interface ReviewResult {
  required: boolean;
  status: ReviewStatus;
  notes: string;
}

export function reviewCode(diff: string): ReviewResult {
  // Placeholder: always require and set pending until human marks
  return { required: true, status: 'pending', notes: '' };
}
