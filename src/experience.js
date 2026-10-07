// Everything the match score compares a job against: your resumes, your portfolio website, and your other work.
import { listResumes } from './materials.js';
import { portfolioText } from './portfolio.js';
import { workText } from './work.js';

export function experienceText() {
  return [...listResumes().map((r) => r.text), portfolioText(), workText()].filter(Boolean).join('\n');
}
