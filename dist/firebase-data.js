import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import { doc, getDocFromServer, getFirestore, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyAalBmZPF_E8fyTNWrhGqPDZ4qPm666G7o',
  authDomain: 'gvik-3d311.firebaseapp.com',
  projectId: 'gvik-3d311',
  storageBucket: 'gvik-3d311.firebasestorage.app',
  messagingSenderId: '800310802643',
  appId: '1:800310802643:web:b861f68f285bdf108b7c26'
});

const db = getFirestore(app);
const auth = getAuth(app);
const builderUid = 'hJkbDc8jPkRD8xPmwQgzEJSlBwa2';

export async function loadCourseConfig() {
  const snapshot = await getDocFromServer(doc(db, 'courses', 'gustavsvik'));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return typeof data.configJson === 'string' ? JSON.parse(data.configJson) : null;
}

export async function signInBuilder(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if (credential.user.uid !== builderUid) {
    await signOut(auth);
    throw new Error('not-authorized');
  }
  return credential.user;
}

export async function signOutBuilder() {
  await signOut(auth);
}

export async function saveCourseConfig(config) {
  if (auth.currentUser?.uid !== builderUid) throw new Error('not-authorized');
  await setDoc(doc(db, 'courses', 'gustavsvik'), {
    configJson: JSON.stringify(config),
    schemaVersion: 1,
    sourceRevision: Date.now(),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid
  });
}
