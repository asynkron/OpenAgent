import { normaliseText, type AgentEventPayload } from './chat_model.js';

export type NormalisedEventFields = {
  text: string;
  title: string;
  subtitle: string;
  description: string;
  details: string;
  scope: string;
};

export type ResolvedDisplay = { header: string; body: string };

export const normaliseField = (value: unknown): string => normaliseText(value).trim();

export const normaliseEventFields = (
  payload: AgentEventPayload = {},
): NormalisedEventFields => ({
  text: normaliseField(payload.text),
  title: normaliseField(payload.title),
  subtitle: normaliseField(payload.subtitle),
  description: normaliseField(payload.description),
  details: normaliseField(payload.details),
  scope: normaliseField(payload.metadata?.scope),
});

// Preserve the explicit fallback priority each resolver expects.
const pickFirst = (...candidates: string[]): string =>
  candidates.find((candidate) => candidate.length > 0) ?? '';

// Only surface events that still carry a heading or body after normalisation.
const finaliseDisplay = (
  header: string,
  body: string,
  fields: NormalisedEventFields,
): ResolvedDisplay | null => {
  const resolvedBody = !header && !body && fields.text ? fields.text : body;
  if (!header && !resolvedBody) {
    return null;
  }
  return { header, body: resolvedBody };
};

export const resolveBannerDisplay = (
  fields: NormalisedEventFields,
): ResolvedDisplay | null => {
  const header = pickFirst(fields.title, fields.text, 'Agent banner');
  const body = pickFirst(
    fields.subtitle,
    fields.description,
    fields.details,
    fields.text !== header ? fields.text : '',
  );
  return finaliseDisplay(header, body, fields);
};

export const resolveStatusDisplay = (
  fields: NormalisedEventFields,
): ResolvedDisplay | null =>
  finaliseDisplay(
    pickFirst(fields.title, 'Status update'),
    pickFirst(fields.subtitle, fields.description, fields.details, fields.text),
    fields,
  );

export const resolveDefaultDisplay = (
  fields: NormalisedEventFields,
): ResolvedDisplay | null =>
  finaliseDisplay(
    pickFirst(fields.title, fields.text),
    pickFirst(fields.subtitle, fields.description, fields.details, fields.text),
    fields,
  );
