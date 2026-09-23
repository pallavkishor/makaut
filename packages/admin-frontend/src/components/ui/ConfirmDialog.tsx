'use client';

import type { ReactNode } from 'react';
import { Button } from './Button';
import { FormError } from './Feedback';
import { Modal } from './Modal';

/**
 * Confirmation dialog for destructive actions. The consequences are spelled out
 * in `description`/`children` so nothing is deleted on a vague prompt.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  pending = false,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      size="sm"
      dismissible={!pending}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error ? (
        <div className={children ? 'mt-3' : undefined}>
          <FormError error={error} />
        </div>
      ) : null}
    </Modal>
  );
}
