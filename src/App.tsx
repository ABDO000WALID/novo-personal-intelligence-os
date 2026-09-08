/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppProvider } from './core/providers/AppContext';
import { AppShell } from './components/layout/AppShell';

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

