import { redirect } from 'next/navigation';

/** The admin panel has no dashboard yet; students is the default landing page. */
export default function Home() {
  redirect('/students');
}
