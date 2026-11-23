import type { ReactNode } from 'react';
import CreationAdmission from './creation-admission';

export default function CreationLayout({ children }: { children: ReactNode }) {
  return <CreationAdmission>{children}</CreationAdmission>;
}
