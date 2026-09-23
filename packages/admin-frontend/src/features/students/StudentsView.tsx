'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listStudents, searchStudentsByEmail } from '@/lib/api/students';
import { formatDateTime } from '@/lib/dates';
import { queryKeys } from '@/lib/queryKeys';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { LoadingState } from '@/components/ui/Spinner';
import {
  Table,
  TableCard,
  TableScroll,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui/Table';
import type { Student } from '@/types';

const PAGE_SIZE = 25;

/**
 * Student list with email search (Requirements 7.1, 7.2, 7.3, 7.4).
 *
 * Two data sources share one table: the paginated list endpoint, and the email
 * search endpoint whenever a query is typed.
 */
export function StudentsView() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 300);
  const searching = search.length > 0;

  // A new query always starts from the first page of the unfiltered list.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const listQuery = useQuery({
    queryKey: queryKeys.students.list(page, PAGE_SIZE),
    queryFn: () => listStudents({ page, pageSize: PAGE_SIZE }),
    enabled: !searching,
  });

  const searchQuery = useQuery({
    queryKey: queryKeys.students.search(search),
    queryFn: () => searchStudentsByEmail(search),
    enabled: searching,
  });

  const active = searching ? searchQuery : listQuery;
  const students: Student[] = searching
    ? (searchQuery.data ?? [])
    : (listQuery.data?.items ?? []);

  return (
    <>
      <PageHeader
        title="Students"
        description="Registered student accounts, their subscriptions, and their devices."
      />

      <div className="mb-3">
        <label
          htmlFor="student-email-search"
          className="block text-sm font-medium text-foreground"
        >
          Search by email
        </label>
        <div className="mt-1 flex max-w-md gap-2">
          <input
            id="student-email-search"
            type="search"
            value={searchInput}
            placeholder="student@example.com"
            autoComplete="off"
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSearchInput('');
              }
            }}
            className="block w-full rounded-md border-0 px-3 py-2 text-sm text-foreground shadow-sm ring-1 ring-inset ring-border-strong placeholder:text-muted-300 focus:ring-2 focus:ring-inset focus:ring-primary-600"
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          Press Escape to clear the search.
        </p>
      </div>

      {active.isError ? (
        <div className="mb-3">
          <ErrorState
            error={active.error}
            title="Could not load students"
            onRetry={() => void active.refetch()}
          />
        </div>
      ) : null}

      <TableCard>
        <TableScroll>
          <Table caption="Registered students">
            <Thead>
              <tr>
                <Th>Email</Th>
                <Th>Registered</Th>
                <Th className="text-right">Devices</Th>
                <Th className="text-right">Active subscriptions</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </Thead>
            <Tbody>
              {students.map((student) => (
                <Tr key={student.id}>
                  <Td className="font-medium text-foreground">{student.email}</Td>
                  <Td className="whitespace-nowrap text-muted">
                    {formatDateTime(student.registeredAt)}
                  </Td>
                  <Td className="text-right tabular-nums text-muted">
                    {student.deviceCount ?? '—'}
                  </Td>
                  <Td className="text-right tabular-nums text-muted">
                    {student.activeSubscriptionCount ?? '—'}
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/students/${student.id}`}
                      className="rounded text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
                    >
                      View
                    </Link>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableScroll>

        {active.isPending ? <LoadingState label="Loading students…" /> : null}

        {!active.isPending && !active.isError && students.length === 0 ? (
          <EmptyState
            title={searching ? 'No students match that email' : 'No students yet'}
            description={
              searching
                ? 'Try a different email address or clear the search.'
                : 'Student accounts appear here once they register on the student platform.'
            }
          />
        ) : null}

        {!searching && listQuery.data ? (
          <Pagination
            pagination={listQuery.data.pagination}
            onPageChange={setPage}
            disabled={listQuery.isFetching}
          />
        ) : null}
      </TableCard>
    </>
  );
}
