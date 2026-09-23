'use client';

import { useAdminAuth } from './AdminAuthProvider';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatCountdown } from '@/lib/sessionTimeout';

/**
 * Inactivity warning shown at the 25 minute mark (design 3.6). It is not
 * dismissible by Escape or overlay click so the choice is explicit: keep the
 * session, or sign out now.
 */
export function SessionTimeoutModal() {
  const { sessionPhase, msUntilLogout, keepAlive, logout } = useAdminAuth();

  const open = sessionPhase === 'warning';

  return (
    <Modal
      open={open}
      title="Your session is about to expire"
      description="For security, admin sessions end after 30 minutes of inactivity."
      size="sm"
      dismissible={false}
      onClose={keepAlive}
      footer={
        <>
          <Button variant="secondary" onClick={() => void logout('manual')}>
            Sign out now
          </Button>
          <Button onClick={keepAlive}>Stay signed in</Button>
        </>
      }
    >
      <p className="text-sm text-foreground">
        You will be signed out in{' '}
        <span
          className="font-semibold tabular-nums text-primary-800"
          aria-live="polite"
          aria-atomic="true"
        >
          {formatCountdown(msUntilLogout)}
        </span>
        .
      </p>
    </Modal>
  );
}
