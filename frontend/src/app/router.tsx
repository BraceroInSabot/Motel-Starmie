import { createBrowserRouter } from 'react-router';

import { HomePage } from './HomePage';

/** Feature routes (booking, front desk, housekeeping, ...) are added here per story. */
export function createAppRouter() {
  return createBrowserRouter([{ path: '/', element: <HomePage /> }]);
}
