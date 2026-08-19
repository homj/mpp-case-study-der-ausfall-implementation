/**
 * Notification templates. `de` is the default and complete; `en` mirrors the
 * keys. German text is allowed here and nowhere else in the codebase.
 */
export type Locale = 'de' | 'en';

export interface NewSlotContext {
  startsAt: Date;
  practitionerName: string;
  locationName: string;
  locationAddress: string;
}

export interface MessageContext {
  patientName: string;
  practiceName: string;
  frontDeskPhone: string;
  originalStart: Date;
  newSlot?: NewSlotContext;
}

export interface RenderedMessage {
  subject: string;
  body: string;
}

export type MessageTemplate = 'rebooked' | 'cancelled_today' | 'cancelled' | 'correction';

function formatInstant(instant: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

function describeSlot(context: MessageContext, locale: Locale): string {
  const slot = context.newSlot;
  if (slot === undefined) return '';
  return `${formatInstant(slot.startsAt, locale)} — ${slot.practitionerName} (${slot.locationName}, ${slot.locationAddress})`;
}

type Renderer = (context: MessageContext, locale: Locale) => RenderedMessage;

const german: Record<MessageTemplate, Renderer> = {
  rebooked: (context, locale) => ({
    subject: 'Ihr Termin wurde verlegt',
    body:
      `Guten Tag ${context.patientName},\n\n` +
      `Ihr Termin am ${formatInstant(context.originalStart, locale)} kann leider nicht wie geplant stattfinden. ` +
      `Wir haben Sie umgebucht auf: ${describeSlot(context, locale)}.\n\n` +
      `Passt der neue Termin nicht? Rufen Sie uns bitte an: ${context.frontDeskPhone}.\n\n` +
      `Ihr Team von ${context.practiceName}`,
  }),
  cancelled_today: (context, locale) => ({
    subject: 'Ihr Termin heute fällt leider aus',
    body:
      `Guten Tag ${context.patientName},\n\n` +
      `Ihr Termin am ${formatInstant(context.originalStart, locale)} kann leider nicht stattfinden. ` +
      'Bitte kommen Sie nicht in die Praxis. Wir melden uns in Kürze bei Ihnen und suchen einen neuen Termin.\n\n' +
      `Bei Fragen erreichen Sie uns unter ${context.frontDeskPhone}.\n\n` +
      `Ihr Team von ${context.practiceName}`,
  }),
  cancelled: (context, locale) => ({
    subject: 'Ihr Termin wurde abgesagt',
    body:
      `Guten Tag ${context.patientName},\n\n` +
      `Ihr Termin am ${formatInstant(context.originalStart, locale)} wurde abgesagt. ` +
      'Wir melden uns bei Ihnen und vereinbaren einen neuen Termin. ' +
      `Sie erreichen uns unter ${context.frontDeskPhone}.\n\n` +
      `Ihr Team von ${context.practiceName}`,
  }),
  correction: (context, locale) => ({
    subject: 'Korrektur zu unserer letzten Nachricht',
    body:
      `Guten Tag ${context.patientName},\n\n` +
      `bitte beachten Sie: Die Umbuchung Ihres Termins vom ${formatInstant(context.originalStart, locale)} wurde zurückgenommen. ` +
      `Wir melden uns bei Ihnen. Bei Fragen: ${context.frontDeskPhone}.\n\n` +
      `Ihr Team von ${context.practiceName}`,
  }),
};

const english: Record<MessageTemplate, Renderer> = {
  rebooked: (context, locale) => ({
    subject: 'Your appointment has been moved',
    body:
      `Hello ${context.patientName},\n\n` +
      `Your appointment on ${formatInstant(context.originalStart, locale)} cannot take place as planned. ` +
      `We have moved you to: ${describeSlot(context, locale)}.\n\n` +
      `Does the new time not work? Please call us: ${context.frontDeskPhone}.\n\n` +
      `Your ${context.practiceName} team`,
  }),
  cancelled_today: (context, locale) => ({
    subject: 'Your appointment today is cancelled',
    body:
      `Hello ${context.patientName},\n\n` +
      `Your appointment on ${formatInstant(context.originalStart, locale)} cannot take place. ` +
      'Please do not come to the practice. We will contact you shortly to find a new appointment.\n\n' +
      `Questions? Call ${context.frontDeskPhone}.\n\n` +
      `Your ${context.practiceName} team`,
  }),
  cancelled: (context, locale) => ({
    subject: 'Your appointment was cancelled',
    body:
      `Hello ${context.patientName},\n\n` +
      `Your appointment on ${formatInstant(context.originalStart, locale)} was cancelled. ` +
      'We will contact you to arrange a new one. ' +
      `You can reach us at ${context.frontDeskPhone}.\n\n` +
      `Your ${context.practiceName} team`,
  }),
  correction: (context, locale) => ({
    subject: 'Correction to our last message',
    body:
      `Hello ${context.patientName},\n\n` +
      `Please note: the rebooking of your appointment from ${formatInstant(context.originalStart, locale)} has been withdrawn. ` +
      `We will contact you. Questions: ${context.frontDeskPhone}.\n\n` +
      `Your ${context.practiceName} team`,
  }),
};

export function renderMessage(
  template: MessageTemplate,
  context: MessageContext,
  locale: Locale = 'de',
): RenderedMessage {
  return (locale === 'en' ? english : german)[template](context, locale);
}
