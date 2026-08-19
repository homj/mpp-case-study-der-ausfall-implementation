/**
 * Mock dataset for the demo. It mirrors the case study: Anna Weber is absent on
 * Monday 2026-09-07 from 07:40 Berlin time. Times are UTC; Berlin is +02:00 that day.
 */
import type {
  AbsenceView,
  AutomatedActionView,
  DataIssueView,
  NotificationView,
  PractitionerOption,
  RescheduleTaskView,
  SlotView,
  TerminoWriteView,
} from './types'

export const MOCK_ABSENCE_ID = 'abs_demo_0001'

const LOC_MITTE = { id: 'loc_01', name: 'meinphysio+ Mitte' }
const LOC_KREUZBERG = { id: 'loc_02', name: 'meinphysio+ Kreuzberg' }

export const MOCK_PRACTITIONERS: PractitionerOption[] = [
  { terminoPractitionerId: 'prac_01', name: 'Anna Weber' },
  { terminoPractitionerId: 'prac_02', name: 'Jonas Brandt' },
  { terminoPractitionerId: 'prac_04', name: 'Sofia Lindqvist' },
  { terminoPractitionerId: 'prac_05', name: 'Meltem Aydin' },
  { terminoPractitionerId: 'prac_06', name: 'David Okafor' },
  { terminoPractitionerId: 'prac_07', name: 'Clara Petersen' },
  { terminoPractitionerId: 'prac_08', name: 'Tobias Falk' },
]

function slot(
  terminoPractitionerId: string,
  practitionerName: string,
  location: { id: string; name: string },
  startsAt: string,
  durationMin: number,
): SlotView {
  return {
    terminoPractitionerId,
    practitionerName,
    terminoLocationId: location.id,
    locationName: location.name,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + durationMin * 60_000).toISOString(),
  }
}

const tasks: RescheduleTaskView[] = [
  {
    id: 'task_01',
    rank: 1,
    status: 'open',
    contactAttempts: 0,
    patient: {
      name: 'Sabine Czerny',
      phone: '+49 151 55011203',
      email: 'sabine.czerny@example.com',
      reachableByPhone: true,
      unmatched: false,
    },
    appointments: [
      {
        appointment: {
          terminoAppointmentId: 'apt_000101',
          startsAt: '2026-09-07T06:00:00.000Z',
          durationMin: 20,
          serviceCode: 'KG',
          serviceLabel: 'Krankengymnastik',
          terminoLocationId: LOC_MITTE.id,
          locationName: LOC_MITTE.name,
          inProgress: false,
          imminent: true,
        },
        decision: { kind: 'front_desk', reason: 'imminent_no_swap', candidates: [], sameDayImpossible: false },
        warnings: [],
        duplicateSameDay: false,
      },
    ],
  },
  {
    id: 'task_02',
    rank: 2,
    status: 'open',
    contactAttempts: 0,
    patient: {
      name: 'Lena Krause',
      phone: null,
      email: null,
      reachableByPhone: false,
      unmatched: true,
    },
    appointments: [
      {
        appointment: {
          terminoAppointmentId: 'apt_000102',
          startsAt: '2026-09-07T06:20:00.000Z',
          durationMin: 20,
          serviceCode: 'KG',
          serviceLabel: 'Krankengymnastik',
          terminoLocationId: LOC_MITTE.id,
          locationName: LOC_MITTE.name,
          inProgress: false,
          imminent: true,
        },
        decision: {
          kind: 'front_desk',
          reason: 'not_contactable',
          candidates: [slot('prac_06', 'David Okafor', LOC_MITTE, '2026-09-08T06:20:00.000Z', 20)],
          sameDayImpossible: true,
        },
        warnings: [{ code: 'no_prescription', detail: 'No prescription on file. Self-payer assumed.' }],
        duplicateSameDay: false,
      },
    ],
  },
  {
    id: 'task_03',
    rank: 3,
    status: 'retry_contact',
    contactAttempts: 2,
    patient: {
      name: 'Gisela Neumann',
      phone: null,
      email: 'gisela.neumann@example.com',
      reachableByPhone: false,
      unmatched: false,
    },
    appointments: [
      {
        appointment: {
          terminoAppointmentId: 'apt_000103',
          startsAt: '2026-09-07T07:40:00.000Z',
          durationMin: 20,
          serviceCode: 'MT',
          serviceLabel: 'Manuelle Therapie',
          terminoLocationId: LOC_MITTE.id,
          locationName: LOC_MITTE.name,
          inProgress: false,
          imminent: false,
        },
        decision: {
          kind: 'front_desk',
          reason: 'not_contactable',
          candidates: [
            slot('prac_04', 'Sofia Lindqvist', LOC_MITTE, '2026-09-08T07:40:00.000Z', 20),
            slot('prac_08', 'Tobias Falk', LOC_MITTE, '2026-09-09T09:00:00.000Z', 20),
          ],
          sameDayImpossible: true,
        },
        warnings: [
          { code: 'start_deadline', detail: 'Prescription issued 2026-08-05: first treatment must start by 2026-09-02.' },
          { code: 'below_frequency', detail: 'Prescribed frequency 2 per week. 0 treatments so far this week.' },
        ],
        duplicateSameDay: false,
      },
    ],
  },
  {
    id: 'task_04',
    rank: 4,
    status: 'in_progress',
    contactAttempts: 1,
    patient: {
      name: 'Marek Kowalski',
      phone: '+49 151 55011744',
      email: 'marek.kowalski@example.com',
      reachableByPhone: true,
      unmatched: false,
    },
    appointments: [
      {
        appointment: {
          terminoAppointmentId: 'apt_000104',
          startsAt: '2026-09-07T08:00:00.000Z',
          durationMin: 20,
          serviceCode: 'KG',
          serviceLabel: 'Krankengymnastik',
          terminoLocationId: LOC_MITTE.id,
          locationName: LOC_MITTE.name,
          inProgress: false,
          imminent: false,
        },
        decision: {
          kind: 'proposal',
          candidates: [
            slot('prac_02', 'Jonas Brandt', LOC_MITTE, '2026-09-09T08:00:00.000Z', 20),
            slot('prac_07', 'Clara Petersen', LOC_KREUZBERG, '2026-09-08T13:00:00.000Z', 20),
          ],
          sameDayImpossible: false,
        },
        warnings: [],
        duplicateSameDay: true,
      },
      {
        appointment: {
          terminoAppointmentId: 'apt_000105',
          startsAt: '2026-09-07T14:20:00.000Z',
          durationMin: 20,
          serviceCode: 'KG',
          serviceLabel: 'Krankengymnastik',
          terminoLocationId: LOC_KREUZBERG.id,
          locationName: LOC_KREUZBERG.name,
          inProgress: false,
          imminent: false,
        },
        decision: {
          kind: 'swap_proposal',
          slot: slot('prac_07', 'Clara Petersen', LOC_KREUZBERG, '2026-09-07T14:20:00.000Z', 20),
        },
        warnings: [],
        duplicateSameDay: true,
      },
    ],
  },
  {
    id: 'task_05',
    rank: 5,
    status: 'open',
    contactAttempts: 0,
    patient: {
      name: 'Katrin Meier',
      phone: '+49 151 55011980',
      email: 'katrin.meier@example.com',
      reachableByPhone: true,
      unmatched: false,
    },
    appointments: [
      {
        appointment: {
          terminoAppointmentId: 'apt_000106',
          startsAt: '2026-09-07T09:00:00.000Z',
          durationMin: 20,
          serviceCode: 'KG',
          serviceLabel: 'Krankengymnastik',
          terminoLocationId: LOC_MITTE.id,
          locationName: LOC_MITTE.name,
          inProgress: false,
          imminent: false,
        },
        decision: {
          kind: 'proposal',
          candidates: [slot('prac_06', 'David Okafor', LOC_KREUZBERG, '2026-09-08T09:00:00.000Z', 20)],
          sameDayImpossible: false,
        },
        warnings: [],
        duplicateSameDay: false,
      },
    ],
  },
  {
    id: 'task_06',
    rank: 6,
    status: 'open',
    contactAttempts: 0,
    patient: {
      name: 'Brigitte Hoffmann',
      phone: '+49 151 55011321',
      email: 'brigitte.hoffmann@example.com',
      reachableByPhone: true,
      unmatched: false,
    },
    appointments: [
      {
        appointment: {
          terminoAppointmentId: 'apt_000107',
          startsAt: '2026-09-07T12:40:00.000Z',
          durationMin: 45,
          serviceCode: 'MLD45',
          serviceLabel: 'Manuelle Lymphdrainage 45',
          terminoLocationId: LOC_KREUZBERG.id,
          locationName: LOC_KREUZBERG.name,
          inProgress: false,
          imminent: false,
        },
        decision: { kind: 'front_desk', reason: 'no_slot', candidates: [], sameDayImpossible: true },
        warnings: [
          { code: 'units_nearly_used', detail: 'Prescription: 10 units, 9 used. Check for a follow-up prescription.' },
        ],
        duplicateSameDay: false,
      },
    ],
  },
]

const automatedActions: AutomatedActionView[] = [
  {
    id: 'auto_01',
    patientName: 'Kerstin Nowak',
    from: { startsAt: '2026-09-07T07:20:00.000Z', practitionerName: 'Anna Weber', locationName: LOC_MITTE.name },
    to: slot('prac_02', 'Jonas Brandt', LOC_MITTE, '2026-09-07T07:20:00.000Z', 20),
    notificationSent: true,
    undone: false,
  },
  {
    id: 'auto_02',
    patientName: 'Peter Ruhland',
    from: { startsAt: '2026-09-07T08:40:00.000Z', practitionerName: 'Anna Weber', locationName: LOC_MITTE.name },
    to: slot('prac_04', 'Sofia Lindqvist', LOC_MITTE, '2026-09-08T08:40:00.000Z', 20),
    notificationSent: true,
    undone: false,
  },
  {
    id: 'auto_03',
    patientName: 'Ayse Demir',
    from: { startsAt: '2026-09-07T13:20:00.000Z', practitionerName: 'Anna Weber', locationName: LOC_KREUZBERG.name },
    to: slot('prac_08', 'Tobias Falk', LOC_KREUZBERG, '2026-09-09T13:20:00.000Z', 20),
    notificationSent: true,
    undone: false,
  },
]

const terminoWrites: TerminoWriteView[] = [
  { id: 'tw_01', op: 'block_practitioner', target: 'prac_01 / 07.09.2026 07:40-23:59', status: 'confirmed', createdAt: '2026-09-07T05:40:12.000Z' },
  { id: 'tw_02', op: 'rebook', target: 'apt_000108 -> prac_02 / 09:20', status: 'delivered', createdAt: '2026-09-07T05:40:31.000Z' },
  { id: 'tw_03', op: 'rebook', target: 'apt_000109 -> prac_04 / 08.09. 10:40', status: 'delivered', createdAt: '2026-09-07T05:40:33.000Z' },
  { id: 'tw_04', op: 'rebook', target: 'apt_000110 -> prac_08 / 09.09. 15:20', status: 'pending', createdAt: '2026-09-07T05:40:35.000Z' },
  { id: 'tw_05', op: 'cancel', target: 'apt_000107 (MLD45, 14:40)', status: 'failed', createdAt: '2026-09-07T05:40:37.000Z' },
]

const notifications: NotificationView[] = [
  { id: 'nt_01', channel: 'sms', recipient: '+49 151 55011455', subject: 'New appointment today 09:20 with Jonas Brandt', status: 'sent', createdAt: '2026-09-07T05:40:32.000Z' },
  { id: 'nt_02', channel: 'email', recipient: 'peter.ruhland@example.com', subject: 'Appointment today cancelled - new appointment tomorrow 10:40', status: 'sent', createdAt: '2026-09-07T05:40:34.000Z' },
  { id: 'nt_03', channel: 'email', recipient: 'ayse.demir@example.com', subject: 'Appointment today cancelled - new appointment on 2026-09-09 15:20', status: 'sent', createdAt: '2026-09-07T05:40:36.000Z' },
  { id: 'nt_04', channel: 'email', recipient: 'brigitte.hoffmann@example.com', subject: 'Appointment today 14:40 cancelled', status: 'pending', createdAt: '2026-09-07T05:40:38.000Z' },
]

const dataIssues: DataIssueView[] = [
  {
    id: 'issue_01',
    kind: 'unmatched_patient',
    subject: 'Lena Krause (pat_02911)',
    detail: 'No match in patient master data. Self-payer assumed.',
    candidates: [],
  },
  {
    id: 'issue_02',
    kind: 'fuzzy_patient_match',
    subject: 'Katrin Meier (pat_02074)',
    detail: 'Possible match in patient master data. Please confirm.',
    candidates: [
      {
        patientId: '6f0f6b5e-2b25-4a02-9f38-3a53d0b41f21',
        name: 'Katrin Meyer',
        birthDate: '1971-04-03',
        matchedFields: ['birth_date', 'first_name', 'phone'],
      },
    ],
  },
  {
    id: 'issue_03',
    kind: 'unknown_practitioner',
    subject: 'prac_03',
    detail: 'Termino exports appointments for an unknown practitioner id.',
    candidates: [],
  },
]

export const MOCK_ABSENCE: AbsenceView = {
  id: MOCK_ABSENCE_ID,
  practitionerName: 'Anna Weber',
  terminoPractitionerId: 'prac_01',
  category: 'sick',
  startsAt: '2026-09-07T05:40:00.000Z',
  endsAt: '2026-09-07T21:59:00.000Z',
  note: null,
  tasks,
  automatedActions,
  terminoWrites,
  notifications,
  dataIssues,
}
