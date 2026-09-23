import { apiRequest } from '../apiClient';
import { unwrapList, unwrapObject, unwrapPaginated } from './normalize';
import type {
  Paginated,
  RegisteredDevice,
  Student,
  StudentSubscription,
} from '@/types';

/** Admin student management calls (Requirements 7.1 - 7.8). */

export interface ListStudentsParams {
  page: number;
  pageSize: number;
}

export async function listStudents({
  page,
  pageSize,
}: ListStudentsParams): Promise<Paginated<Student>> {
  const body = await apiRequest<unknown>('/api/admin/students', {
    query: { page, pageSize },
  });

  return unwrapPaginated<Student>(body, 'students', { page, pageSize });
}

/** Email search (Requirements 7.3, 7.4). */
export async function searchStudentsByEmail(email: string): Promise<Student[]> {
  const body = await apiRequest<unknown>('/api/admin/students/search', {
    query: { email },
  });

  return unwrapList<Student>(body, 'students');
}

export interface StudentDetail {
  student: Student;
  /**
   * Active subscriptions only, and nested under `student` in the response
   * rather than returned as a sibling collection. Each one names its plan, not
   * a subject.
   */
  subscriptions: StudentSubscription[];
}

export async function getStudent(id: string): Promise<StudentDetail> {
  const body = await apiRequest<unknown>(`/api/admin/students/${id}`);
  const student = unwrapObject<Student & { activeSubscriptions?: unknown }>(
    body,
    'student'
  );

  const { activeSubscriptions, ...rest } = student;

  return {
    student: rest as Student,
    subscriptions: Array.isArray(activeSubscriptions)
      ? (activeSubscriptions as StudentSubscription[])
      : [],
  };
}

export async function listStudentDevices(
  studentId: string
): Promise<RegisteredDevice[]> {
  const body = await apiRequest<unknown>(`/api/admin/students/${studentId}/devices`);

  return unwrapList<RegisteredDevice>(body, 'devices');
}

/** Administrator-initiated device revocation (Requirements 7.7, 7.8). */
export async function revokeStudentDevice(
  studentId: string,
  deviceId: string
): Promise<void> {
  await apiRequest<unknown>(
    `/api/admin/students/${studentId}/devices/${deviceId}`,
    { method: 'DELETE' }
  );
}
