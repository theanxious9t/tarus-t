import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, setPersistence, browserLocalPersistence, signInWithPopup, User } from "firebase/auth";
import { initializeFirestore, collection, doc, setDoc, getDoc, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

const upsertUserProfile = async (user: User) => {
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    status: "online",
    lastSeen: new Timestamp(Math.floor(Date.now() / 1000), 0).toDate().toISOString(),
    friends: [],
    friendRequests: [],
    pinnedChats: [],
    mutedChats: [],
    lockedChats: [],
    starredMessages: [],
    settings: {
      showLastSeen: true,
      showOnlineStatus: true,
      theme: 'dark'
    }
  }, { merge: true });
};

const shouldFallbackToRedirect = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String((error as { code?: string }).code || "");
  return (
    code === "auth/popup-blocked" ||
    code === "auth/operation-not-supported-in-this-environment"
  );
};

export const signInWithGoogle = async () => {
  await setPersistence(auth, browserLocalPersistence);

  try {
    const result = await signInWithPopup(auth, googleProvider);
    await upsertUserProfile(result.user);
    return "popup" as const;
  } catch (error) {
    if (!shouldFallbackToRedirect(error)) {
      console.error("Google popup sign-in failed:", error);
      return null;
    }

    await signInWithRedirect(auth, googleProvider);
    return "redirect" as const;
  }
};

export const completeGoogleRedirectSignIn = async () => {
  try {
    const result = await getRedirectResult(auth);
    if (!result) return null;
    const user = result.user;
    await upsertUserProfile(user);
    return user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    return null;
  }
};

export const syncCurrentUserProfile = async () => {
  if (!auth.currentUser) return null;

  try {
    await upsertUserProfile(auth.currentUser);
    return auth.currentUser;
  } catch (error) {
    console.error("Failed to sync current user profile:", error);
    return null;
  }
};

export const updateUserStatus = async (uid: string, status: 'online' | 'offline' | 'away') => {
  try {
    await setDoc(doc(db, "users", uid), {
      status,
      lastSeen: new Timestamp(Math.floor(Date.now() / 1000), 0).toDate().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
};

export const logout = async () => {
  if (auth.currentUser) {
    await setDoc(doc(db, "users", auth.currentUser.uid), {
      status: "offline",
      lastSeen: new Timestamp(Math.floor(Date.now() / 1000), 0).toDate().toISOString()
    }, { merge: true });
  }
  return auth.signOut();
};

export const getChatId = (uid1: string, uid2: string) => {
  return [uid1, uid2].sort().join("_");
};

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export const sendPushNotification = async (targetUserId: string, title: string, body: string, data?: any) => {
  try {
    await addDoc(collection(db, "notifications"), {
      userId: targetUserId,
      title,
      body,
      data: data || {},
      status: 'pending',
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
};

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
