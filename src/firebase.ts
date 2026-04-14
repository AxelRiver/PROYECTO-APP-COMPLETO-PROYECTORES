import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, Timestamp, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// Helper for Google Sign In
export const signInWithGoogle = async () => {
  // console.log('signInWithGoogle started');
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    // console.log('signInWithPopup success:', user.email);
    
    // Sync user to Firestore
    const userRef = doc(db, 'users', user.uid);
    // console.log('Checking user in Firestore:', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      // console.log('Creating new user in Firestore...');
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        role: 'user',
        createdAt: serverTimestamp()
      });
      // console.log('User created');
    } else {
      // console.log('User already exists in Firestore');
    }
    return user;
  } catch (error) {
    // console.error('signInWithGoogle error:', error);
    throw error;
  }
};

export { 
  onAuthStateChanged, 
  signOut,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  Timestamp,
  getDocFromServer
};
export type { FirebaseUser };

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      // Firebase configuration error
    }
  }
}
testConnection();
