// Chooses what the baby says on a given day for a given reader.
// Pure and deterministic: the same day and relation always give the same messages,
// and the build runs it for every combination to catch gaps.

const WEEK_COUNT = 3;
const ROLE_COUNT = 2;

// Takes `count` items from a list starting at `start`, wrapping round, without repeats.
function take(list, start, count) {
  const out = [];
  for (let i = 0; i < Math.min(count, list.length); i++) out.push(list[(start + i) % list.length]);
  return out;
}

// Sets how a message is performed: excited ones bounce, questions tilt, the rest are tender.
export function moodOf(text) {
  const end = text.trim().slice(-1);
  return end === '?' ? 'curious' : end === '!' ? 'excited' : 'tender';
}

export function relationGroup(data, relation) {
  const preset = data.relations.find((r) => r.id === relation.id);
  return preset ? preset.group : 'family';
}

export function messagesForDay(data, day, relation) {
  const group = relationGroup(data, relation);
  const week = Math.min(40, Math.max(2, day.gaWeek));
  const general = data.babyMessages.byWeek[week];
  const roles = data.babyMessages[group].filter((m) => week >= m.from && week <= m.to).map((m) => m.text);
  const picked = take(general, day.gaDay % general.length, WEEK_COUNT);
  const forReader = take(roles, day.day % Math.max(1, roles.length), ROLE_COUNT);
  // Alternate so a reader's own message appears early in the rotation.
  const mixed = [picked[0], forReader[0], picked[1], forReader[1], picked[2]].filter(Boolean);
  return mixed.map((text) => text.replaceAll('{to}', relation.name));
}
