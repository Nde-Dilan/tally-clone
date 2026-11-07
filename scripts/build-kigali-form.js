import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '../packages/db/package.json'));
const Database = require('better-sqlite3');

const tallyPath = fs.existsSync(path.resolve(__dirname, '../data/form.json'))
  ? path.resolve(__dirname, '../data/form.json')
  : path.resolve(__dirname, '../../dist/form.json');
const dbPath = path.resolve(__dirname, '../.data/dev.db');

const tally = JSON.parse(fs.readFileSync(tallyPath, 'utf8'));
const blocks = tally.blocks;

console.log(`Loaded Tally form with ${blocks.length} blocks.`);

// Sections to completely remove (and all blocks under them)
const excludedSections = ['Finding housing', 'Choosing where to live'];

// Explicit question keys to exclude:
// - Finding housing: main_search_method, search_difficulty, search_challenges, secured_before_arrival, nationality_effect
// - Choosing where to live: top_location_factors, commute_frequency, commute_mode, exercise_frequency, avoid_valleys
// - How much did housing problems affect your studies or daily life?: affected_by_problem
// - About this kind of survey (keep ONLY first 2: heard_via and motivators):
//   remove preferred_mode, best_time, affected_by_problem, data_concerns, rent_talk_comfort, want_results, open_to_interview, contact_email, comments
const excludedQuestionKeys = new Set([
  // Finding housing
  'main_search_method',
  'search_difficulty',
  'search_challenges',
  'secured_before_arrival',
  'nationality_effect',
  // Choosing where to live
  'top_location_factors',
  'commute_frequency',
  'commute_mode',
  'exercise_frequency',
  'avoid_valleys',
  // Under About this kind of survey
  'preferred_mode',
  'best_time',
  'affected_by_problem',
  'data_concerns',
  'rent_talk_comfort',
  'want_results',
  'open_to_interview',
  'contact_email',
  'comments',
]);

// Extract questions and choices
const steps = [];
let currentSection = '';
let currentTitle = '';
let currentDesc = '';

// Helper to convert label to safe value
function toValue(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i];

  if (b.type === 'HEADING_2') {
    const text = (b.payload?.html || '').replace(/<[^>]*>/g, '').trim();
    currentSection = text;
    if (excludedSections.includes(text)) {
      continue;
    }
    if (text) {
      steps.push({
        key: `sec_${toValue(text)}`,
        type: 'message',
        question: text,
        required: false,
      });
    }
  } else if (b.type === 'TITLE' || b.type === 'HEADING_1') {
    currentTitle = (b.payload?.html || '').replace(/<[^>]*>/g, '').trim();
  } else if (b.type === 'TEXT') {
    currentDesc = (b.payload?.html || '').replace(/<[^>]*>/g, '').trim();
  } else if (b.type === 'CHECKBOX' && b.groupType === 'CHECKBOXES') {
    const name = b.payload?.name;
    if (excludedSections.includes(currentSection) || excludedQuestionKeys.has(name)) {
      continue;
    }
    const text = b.payload?.text;
    if (name === 'consent') {
      steps.push({
        key: 'consent',
        type: 'checkbox',
        question: 'Consent',
        helper: text,
        required: true,
      });
    } else {
      let step = steps.find((s) => s.key === name);
      if (!step) {
        step = {
          key: name,
          type: 'multiple_choice',
          selectionMode: 'multiple',
          question: currentTitle || name,
          helper: currentDesc || undefined,
          options: [],
        };
        steps.push(step);
      }
      step.options.push({ label: text, value: toValue(text) });
    }
  } else if (b.type === 'MULTIPLE_CHOICE_OPTION') {
    const name = b.payload?.name;
    if (excludedSections.includes(currentSection) || excludedQuestionKeys.has(name)) {
      continue;
    }
    const text = b.payload?.text;
    let step = steps.find((s) => s.key === name);
    if (!step) {
      step = {
        key: name,
        type: 'multiple_choice',
        selectionMode: 'single',
        question: currentTitle || name,
        helper: currentDesc || undefined,
        required: false,
        options: [],
      };
      steps.push(step);
    }
    step.options.push({ label: text, value: toValue(text) });
  } else if (b.type === 'DROPDOWN_OPTION') {
    const name = b.payload?.name;
    if (excludedSections.includes(currentSection) || excludedQuestionKeys.has(name)) {
      continue;
    }
    const text = b.payload?.text;
    let step = steps.find((s) => s.key === name);
    if (!step) {
      step = {
        key: name,
        type: 'dropdown',
        question: currentTitle || name,
        helper: currentDesc || undefined,
        required: false,
        options: [],
      };
      steps.push(step);
    }
    step.options.push({ label: text, value: toValue(text) });
  } else if (b.type === 'INPUT_TEXT') {
    const name = b.payload?.name;
    if (excludedSections.includes(currentSection) || excludedQuestionKeys.has(name)) {
      continue;
    }
    if (name === 'my_code') {
      steps.push({
        key: 'my_code',
        type: 'text',
        question: 'Your personal referral code',
        helper: 'Your unique referral code is auto-generated below. Share it with classmates to help map Kigali housing!',
        required: false,
      });
    } else {
      steps.push({
        key: name,
        type: 'text',
        question: currentTitle || name,
        placeholder: b.payload?.placeholder || undefined,
        helper: currentDesc || undefined,
        required: false,
      });
    }
  } else if (b.type === 'INPUT_LINK') {
    const name = b.payload?.name;
    if (excludedSections.includes(currentSection) || excludedQuestionKeys.has(name)) {
      continue;
    }
    steps.push({
      key: name,
      type: 'url',
      question: currentTitle || name,
      placeholder: b.payload?.placeholder || undefined,
      helper: currentDesc || undefined,
      required: false,
    });
  } else if (b.type === 'INPUT_NUMBER') {
    const name = b.payload?.name;
    if (excludedSections.includes(currentSection) || excludedQuestionKeys.has(name)) {
      continue;
    }
    const isPrice = name.includes('price') || name.includes('fee');
    steps.push({
      key: name,
      type: 'slider',
      question: currentTitle || name,
      helper: currentDesc || undefined,
      min: isPrice ? 10000 : 1,
      max: isPrice ? 2000000 : 10,
      step: isPrice ? 10000 : 1,
      default: isPrice ? 200000 : 2,
      required: false,
    });
  } else if (b.type === 'INPUT_DATE') {
    const name = b.payload?.name;
    if (excludedSections.includes(currentSection) || excludedQuestionKeys.has(name)) {
      continue;
    }
    steps.push({
      key: name,
      type: 'date',
      question: currentTitle || name,
      helper: currentDesc || undefined,
      required: false,
    });
  } else if (b.type === 'LINEAR_SCALE') {
    const name = b.payload?.name;
    if (excludedSections.includes(currentSection) || excludedQuestionKeys.has(name)) {
      continue;
    }
    steps.push({
      key: name,
      type: 'rating',
      question: currentTitle || name,
      helper: currentDesc || undefined,
      max: 5,
      required: false,
    });
  } else if (b.type === 'INPUT_EMAIL') {
    const name = b.payload?.name;
    if (excludedSections.includes(currentSection) || excludedQuestionKeys.has(name)) {
      continue;
    }
    steps.push({
      key: name,
      type: 'email',
      question: currentTitle || name,
      placeholder: b.payload?.placeholder || undefined,
      helper: currentDesc || undefined,
      required: false,
    });
  } else if (b.type === 'TEXTAREA') {
    const name = b.payload?.name;
    if (excludedSections.includes(currentSection) || excludedQuestionKeys.has(name)) {
      continue;
    }
    steps.push({
      key: name,
      type: 'textarea',
      question: currentTitle || name,
      placeholder: b.payload?.placeholder || undefined,
      helper: currentDesc || undefined,
      required: false,
    });
  } else if (b.type === 'PAGE_BREAK') {
    currentTitle = '';
    currentDesc = '';
  }
}

// Add conditional logic rules (showWhen)
for (const step of steps) {
  if (step.key === 'apartment_name' || step.key === 'room_unit_number') {
    step.showWhen = { field: 'property_type', values: ['apartment_in_a_named_building'] };
  } else if (step.key === 'commission_fee_rwf') {
    step.showWhen = { field: 'agent_involved', values: ['yes'] };
  } else if (step.key === 'nationality_country') {
    step.showWhen = { field: 'nationality_group', values: ['other_african', 'non_african'] };
  }
}

console.log(`Converted into ${steps.length} native form steps.`);

const formConfig = {
  version: 1,
  layout: 'vertical', // Document-first continuous flow
  title: 'Kigali Student Housing Survey',
  cover: {
    enabled: true,
    headline: 'Kigali Student Housing Survey',
    subheadline: `<b>Help CMU students find fair housing in Kigali.</b><br>We are CMU students building the first open map of student rent prices in Kigali. Share one place you rented (or are looking for) and <b>we will send you the results</b>: a price map by neighbourhood.<br><br>⏱ About 6 minutes (about 3 minutes if you are adding another stay). New questions appear as you answer.<br>🔒 Anonymous. Landlords, agents and unit numbers are never published. Results are shown in aggregate only.`,
    ctaText: 'Start Survey',
  },
  branding: {
    background: '#ffffff',
    foreground: '#1f2937',
    primaryColor: '#e11d48',
    font: 'Inter',
    radius: 'soft',
    progressStyle: 'none',
    showHeader: false,
  },
  ending: {
    headline: 'Thank you! 🎉',
    body: 'Your response has been recorded. Your personal referral code is [my_code]. Share it with classmates to help map Kigali housing!',
  },
  steps,
};

const db = new Database(dbPath);

const account = db.prepare("SELECT id FROM account WHERE code = 'acme'").get();
if (!account) {
  console.error('Account acme not found in dev.db!');
  process.exit(1);
}

const slug = 'kigali-housing';
const existing = db.prepare('SELECT id FROM form WHERE account_id = ? AND slug = ?').get(account.id, slug);

let formId;
const now = Date.now();

if (existing) {
  formId = existing.id;
  db.prepare('UPDATE form SET name = ?, config = ?, updated_at = ? WHERE id = ?').run(
    'Kigali Student Housing Survey',
    JSON.stringify(formConfig),
    now,
    formId
  );
  console.log(`Updated existing form with id ${formId} at /acme/f/${slug}`);
} else {
  formId = randomUUID();
  db.prepare(`
    INSERT INTO form (id, account_id, name, slug, config, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(formId, account.id, 'Kigali Student Housing Survey', slug, JSON.stringify(formConfig), now, now);
  console.log(`Created new form with id ${formId} at /acme/f/${slug}`);
}

console.log(`Done! Form ID: ${formId}`);
