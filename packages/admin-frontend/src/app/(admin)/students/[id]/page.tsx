import type { Metadata } from 'next';
import { StudentDetailView } from '@/features/students/StudentDetailView';

export const metadata: Metadata = {
  title: 'Student detail - Admin Panel',
};

export default function StudentDetailPage({ params }: { params: { id: string } }) {
  return <StudentDetailView studentId={params.id} />;
}
