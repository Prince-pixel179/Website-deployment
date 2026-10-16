"use strict";

// ========================================
// FIREBASE CONFIGURATION
// ========================================

const API_KEY = "AIzaSyDNTqyhfJb7G9kRjVPG0HIkiO2CZvLCdhY";
const PROJECT_ID = "learner-support-portal-427a9";

const AUTH_URL = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN_URL = "https://securetoken.googleapis.com/v1";
const FIRESTORE_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ========================================
// SESSION MANAGEMENT
// ========================================

function saveSession(session) {
  localStorage.setItem("fb_session", JSON.stringify(session));
}

export function getSession() {
  try {
    const session = JSON.parse(localStorage.getItem("fb_session"));
    return session;
  } catch {
    return null;
  }
}

export function signOut() {
  localStorage.removeItem("fb_session");
}

// ========================================
// RESPONSE HANDLING
// ========================================

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.error?.message || `Request failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

// ========================================
// FIREBASE AUTHENTICATION
// ========================================

async function authRequest(endpoint, payload) {
  const response = await fetch(
    `${AUTH_URL}/${endpoint}?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  return readResponse(response);
}

export async function signIn(email, password) {
  const data = await authRequest("accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true
  });

  saveSession(data);
  return data;
}

export async function signUp(email, password) {
  const data = await authRequest("accounts:signUp", {
    email,
    password,
    returnSecureToken: true
  });

  saveSession(data);
  return data;
}

// ========================================
// REFRESH EXPIRED LOGIN TOKEN
// ========================================

async function refreshSession(session) {
  if (!session?.refreshToken) {
    signOut();
    throw new Error("Your session has expired. Please sign in again.");
  }

  const response = await fetch(
    `${SECURE_TOKEN_URL}/token?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: session.refreshToken
      })
    }
  );

  const data = await readResponse(response);

  const updatedSession = {
    ...session,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    localId: data.user_id,
    expiresAt: Date.now() + Number(data.expires_in) * 1000
  };

  saveSession(updatedSession);
  return updatedSession;
}

async function getValidSession() {
  let session = getSession();

  if (!session?.idToken) {
    throw new Error("Not authenticated. Please sign in.");
  }

  const expiresAt =
    session.expiresAt ||
    (Date.now() + Number(session.expiresIn || 3600) * 1000);

  if (Date.now() >= expiresAt - 60000) {
    session = await refreshSession(session);
  }

  return session;
}

// ========================================
// FIRESTORE DATA CONVERSION
// ========================================

function toValue(value) {
  if (value === null) {
    return { nullValue: null };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toValue)
      }
    };
  }

  if (typeof value === "object" && value !== undefined) {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, item]) => [
            key,
            toValue(item)
          ])
        )
      }
    };
  }

  throw new Error("Unsupported Firestore value.");
}

function fromValue(value) {
  if (!value) return null;

  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(fromValue);
  }

  if ("mapValue" in value) {
    const result = {};

    for (const [key, item] of Object.entries(
      value.mapValue.fields || {}
    )) {
      result[key] = fromValue(item);
    }

    return result;
  }

  return null;
}

function fromDoc(document) {
  if (!document) return null;

  const id = document.name.split("/").pop();
  const fields = {};

  for (const [key, value] of Object.entries(document.fields || {})) {
    fields[key] = fromValue(value);
  }

  return { id, ...fields };
}

function encodeFields(object) {
  const fields = {};

  for (const [key, value] of Object.entries(object)) {
    fields[key] = toValue(value);
  }

  return fields;
}

// ========================================
// FIRESTORE REQUEST HANDLER
// ========================================

async function fsFetch(path, options = {}) {
  const session = await getValidSession();

  const [resourcePath, queryString = ""] = path.split("?");
  const params = new URLSearchParams(queryString);
  const endpoint = resourcePath.startsWith(":")
    ? `${FIRESTORE_URL}${resourcePath}`
    : `${FIRESTORE_URL}/${resourcePath}`;

  params.set("key", API_KEY);

  const response = await fetch(
    `${endpoint}?${params.toString()}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.idToken}`,
        ...(options.headers || {})
      }
    }
  );

  return readResponse(response);
}

// ========================================
// GET A SINGLE DOCUMENT
// ========================================

export async function getDoc(collection, id) {
  const data = await fsFetch(
    `${encodeURIComponent(collection)}/${encodeURIComponent(id)}`
  );

  return fromDoc(data);
}

// ========================================
// CREATE OR REPLACE A DOCUMENT
// ========================================

export async function setDoc(collection, id, object) {
  const data = await fsFetch(
    `${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: encodeFields(object)
      })
    }
  );

  return fromDoc(data);
}

// ========================================
// CREATE A NEW DOCUMENT
// ========================================

export async function create(collection, object) {
  const data = await fsFetch(
    encodeURIComponent(collection),
    {
      method: "POST",
      body: JSON.stringify({
        fields: encodeFields(object)
      })
    }
  );

  return fromDoc(data);
}

// ========================================
// UPDATE SELECTED FIELDS
// ========================================

export async function update(collection, id, patch) {
  const params = new URLSearchParams();

  for (const key of Object.keys(patch)) {
    params.append("updateMask.fieldPaths", key);
  }

  const path =
    `${encodeURIComponent(collection)}/${encodeURIComponent(id)}?${params.toString()}`;

  const data = await fsFetch(path, {
    method: "PATCH",
    body: JSON.stringify({
      fields: encodeFields(patch)
    })
  });

  return fromDoc(data);
}

// ========================================
// DELETE A DOCUMENT
// ========================================

export async function remove(collection, id) {
  await fsFetch(
    `${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    {
      method: "DELETE"
    }
  );
}

// ========================================
// GET ALL DOCUMENTS IN A COLLECTION
// ========================================

export async function listAll(collection) {
  const data = await fsFetch(encodeURIComponent(collection));

  return (data.documents || []).map(fromDoc);
}

// ========================================
// QUERY DOCUMENTS BY A FIELD VALUE
// ========================================

export async function listByField(collection, field, value) {
  const query = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: "EQUAL",
          value: toValue(value),
        },
      },
    },
  };

  const data = await fsFetch(":runQuery", {
    method: "POST",
    body: JSON.stringify(query),
  });

  return (data || [])
    .map((item) => fromDoc(item.document))
    .filter(Boolean);
}

// ========================================
// GET DOCUMENTS BELONGING TO ONE USER
// ========================================

export async function listMine(collection, userId) {
  const query = {
    structuredQuery: {
      from: [
        {
          collectionId: collection
        }
      ],
      where: {
        fieldFilter: {
          field: {
            fieldPath: "userId"
          },
          op: "EQUAL",
          value: {
            stringValue: userId
          }
        }
      }
    }
  };

  const data = await fsFetch(":runQuery", {
    method: "POST",
    body: JSON.stringify(query)
  });

  return (data || [])
    .map((item) => fromDoc(item.document))
    .filter(Boolean);
}
