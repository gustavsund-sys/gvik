import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import { doc, getDocFromServer, getFirestore } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyAalBmZPF_E8fyTNWrhGqPDZ4qPm666G7o',
  authDomain: 'gvik-3d311.firebaseapp.com',
  projectId: 'gvik-3d311',
  storageBucket: 'gvik-3d311.firebasestorage.app',
  messagingSenderId: '800310802643',
  appId: '1:800310802643:web:b861f68f285bdf108b7c26'
});

const db = getFirestore(app);

export async function loadCourseConfig() {
  const snapshot = await getDocFromServer(doc(db, 'courses', 'gustavsvik'));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return typeof data.configJson === 'string' ? JSON.parse(data.configJson) : null;
}
