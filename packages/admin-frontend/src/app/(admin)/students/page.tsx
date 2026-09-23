import type { Metadata } from 'next';
import { StudentsView } from '@/features/students/StudentsView';

export const metadata: Metadata = {
  title: 'Students - Admin Panel',
};

export default function StudentsPage() {
  return <StudentsView />;
}
