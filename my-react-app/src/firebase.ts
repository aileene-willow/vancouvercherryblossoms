import { initializeApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';

// Validate required Firebase configuration
const requiredConfigKeys = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
] as const;

// Configuration validation patterns
const configPatterns = {
    apiKey: /^[A-Za-z0-9_-]+$/,
    projectId: /^[a-z0-9-]+$/,
    messagingSenderId: /^\d+$/,
    appId: /^1:\d+:[a-z0-9:]+$/
} as const;

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCeSmtgSrUKm94ZlP96IwOzpkRrhkJ7PIE",
    authDomain: "sakuravancouver-a35a3.firebaseapp.com",
    projectId: "sakuravancouver-a35a3",
    storageBucket: "sakuravancouver-a35a3.firebasestorage.app",
    messagingSenderId: "321905075130",
    appId: "1:321905075130:web:097e3eec274beacb4df383",
    measurementId: "G-JHQFSD0QZ1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and get a reference to the service
export const database = getDatabase(app);

export default app; 