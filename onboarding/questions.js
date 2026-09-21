// onboarding/questions.js
// The exact application questions from SOP Section 4, split into the general
// set (everyone) and the two department sets. buildQuestions() assembles the
// list for a given department pick (builder / mod / both).

const GENERAL = [
  'Timezone',
  'Roughly when are you usually online? (If you are in school or work, please consider that in your answer.)',
  'Why are you considering joining us?',
  'Have you had staff experience anywhere else? Please explain.',
];

const BUILDING = [
  'Do you have prior server-building experience, especially SCP RP? If yes, provide server link(s) or image link(s) as examples.',
  'A client tells you "make it feel scary but professional" and nothing else. What do you ask them before building anything?',
  'Are you comfortable being given temporary admin access in a stranger\'s server and working live inside it?',
  'Explain the difference between advanced permissions and basic permissions when doing perms for a channel or category.',
  'A client keeps changing their mind during a build. How do you handle this?',
];

const MODERATION = [
  'Describe a real (or realistic) situation where two members are arguing and it\'s escalating. What do you actually do, step by step?',
  'How do you personally decide warning vs. immediate mute/kick?',
  'Are you comfortable enforcing rules on people you\'re friendly with?',
  'Have you ever had to de-escalate a situation where you were personally frustrated? How\'d you handle it?',
  'What would you do if you disagreed with another Mod\'s punishment call in front of the member being punished?',
];

// department: 'builder' | 'mod' | 'both'
function buildQuestions(department) {
  const list = [...GENERAL];
  if (department === 'builder' || department === 'both') list.push(...BUILDING);
  if (department === 'mod' || department === 'both') list.push(...MODERATION);
  return list;
}

module.exports = { GENERAL, BUILDING, MODERATION, buildQuestions };
