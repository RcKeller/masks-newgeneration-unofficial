/**
 * Jest Setup File
 * Configures the test environment with FoundryVTT mocks
 */

import { setupFoundryMocks, cleanupFoundryMocks } from "./__mocks__/foundry";

// Setup mocks before all tests
beforeAll(() => {
	setupFoundryMocks();
});

// Reset mocks before each test
beforeEach(() => {
	setupFoundryMocks();
});

// Cleanup after all tests
afterAll(() => {
	cleanupFoundryMocks();
});
