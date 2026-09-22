import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import { doc, getDocFromServer, getFirestore, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { mergeCourseConfigs } from './config-merge.js?v=1';

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
const courseIds = new Set(['gustavsvik', 'mosjobanan', 'pay-and-play']);

function checkedCourseId(courseId) {
  if (!courseIds.has(courseId)) throw new Error('invalid-course');
  return courseId;
}

export async function loadCourseConfig() {
  return (await loadCourseConfigSnapshot())?.config || null;
}

export async function loadCourseConfigSnapshot(courseId = 'gustavsvik') {
  const snapshot = await getDocFromServer(doc(db, 'courses', checkedCourseId(courseId)));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return typeof data.configJson === 'string' ? { config: JSON.parse(data.configJson), revision: Number(data.sourceRevision) || 0 } : null;
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

export async function saveCourseConfig(config, baseConfig, baseRevision, courseId = 'gustavsvik') {
  if (auth.currentUser?.uid !== builderUid) throw new Error('not-authorized');
  const ref = doc(db, 'courses', checkedCourseId(courseId));
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists() ? snapshot.data() : null;
    const remoteConfig = data?.configJson ? JSON.parse(data.configJson) : {};
    const remoteRevision = Number(data?.sourceRevision) || 0;
    const result = remoteRevision === Number(baseRevision)
      ? { config, conflicts: [] }
      : mergeCourseConfigs(baseConfig || {}, config, remoteConfig);
    if (result.conflicts.length) {
      const error = new Error(`conflict:${result.conflicts.join(',')}`);
      error.code = 'course-conflict';
      error.conflicts = result.conflicts;
      throw error;
    }
    const revision = Date.now();
    transaction.set(ref, {
      configJson: JSON.stringify(result.config),
      schemaVersion: 1,
      sourceRevision: revision,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    });
    return { config: result.config, revision };
  });
}
