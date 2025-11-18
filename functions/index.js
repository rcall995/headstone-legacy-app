/**
 * IMPORTANT: To run these functions, you must install all the required packages.
 * Open your terminal IN THE 'functions' FOLDER and run the following command:
 *
 * npm install firebase-admin firebase-functions @mapbox/mapbox-sdk @google-cloud/vision square
 *
 */

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const vision = require("@google-cloud/vision");
const { Client, Environment } = require("square");

// --- Function Secrets and Initializations ---
const squareAccessToken = defineSecret("SQUARE_ACCESS_TOKEN");
const mapboxToken = defineSecret("mapbox-token");
const SQUARE_LOCATION_ID = "YOUR_LOCATION_ID_HERE";

const initializeApp = () => {
    if (admin.apps.length === 0) {
        admin.initializeApp();
    }
};

let db;
let visionClient;
let squareClient;

// *** CORRECTED FUNCTION TO FIX YOUR DATA ***
exports.addMissingUpdateTimestamp = onRequest(async (req, res) => {
    initializeApp();
    db = db || admin.firestore();
    try {
        const snapshot = await db.collection('memorials').get();
        const memorialsToUpdate = [];

        snapshot.forEach(doc => {
            if (!doc.data().updatedAt) {
                memorialsToUpdate.push(doc);
            }
        });

        if (memorialsToUpdate.length === 0) {
            return res.status(200).send("No memorials were found missing the 'updatedAt' field.");
        }

        const batch = db.batch();
        memorialsToUpdate.forEach(doc => {
            const updateTime = doc.data().createdAt || admin.firestore.FieldValue.serverTimestamp();
            batch.update(doc.ref, { updatedAt: updateTime });
        });

        await batch.commit();
        return res.status(200).send(`Successfully added 'updatedAt' to ${memorialsToUpdate.length} memorials.`);

    } catch (error) {
        console.error("Data migration for 'updatedAt' failed:", error);
        return res.status(500).send("An error occurred during the migration.");
    }
});
// ************************************

// ... (The rest of the file remains unchanged) ...
exports.createReciprocalRelationship = onDocumentWritten("memorials/{memorialId}", async (event) => {
    initializeApp();
    db = db || admin.firestore();
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!afterData || !afterData.relatives) { return null; }
    const beforeRelatives = beforeData?.relatives?.map(r => r.memorialId) || [];
    const afterRelatives = afterData.relatives;
    const addedRelatives = afterRelatives.filter(r => r.memorialId && !beforeRelatives.includes(r.memorialId));
    if (addedRelatives.length === 0) { return null; }
    const reciprocalMap = { 'Mother': 'Son/Daughter', 'Father': 'Son/Daughter', 'Son': 'Parent', 'Daughter': 'Parent', 'Spouse': 'Spouse', 'Husband': 'Wife', 'Wife': 'Husband', 'Brother': 'Sibling', 'Sister': 'Sibling', 'Grandmother': 'Grandchild', 'Grandfather': 'Grandchild', 'Grandson': 'Grandparent', 'Granddaughter': 'Grandparent' };
    const promises = addedRelatives.map(async (relative) => {
        const reciprocalRelationship = reciprocalMap[relative.relationship] || 'Relative';
        const newRelativeData = { name: afterData.name, relationship: reciprocalRelationship, memorialId: event.params.memorialId };
        const relativeRef = db.collection('memorials').doc(relative.memorialId);
        return db.runTransaction(async (transaction) => {
            const relativeDoc = await transaction.get(relativeRef);
            if (!relativeDoc.exists) return;
            const existingRelatives = relativeDoc.data().relatives || [];
            const alreadyLinked = existingRelatives.some(r => r.memorialId === event.params.memorialId);
            if (!alreadyLinked) {
                transaction.update(relativeRef, { relatives: admin.firestore.FieldValue.arrayUnion(newRelativeData) });
            }
        });
    });
    return Promise.all(promises);
});
exports.migrateCurators = onRequest(async (req, res) => {
    initializeApp();
    db = db || admin.firestore();
    try {
        const snapshot = await db.collection('memorials').where('curatorId', '!=', null).get();
        if (snapshot.empty) {
            res.status(200).send("No memorials with the legacy 'curatorId' field were found.");
            return;
        }
        const batch = db.batch();
        let migrationCount = 0;
        for (const doc of snapshot.docs) {
            const memorial = doc.data();
            if (!memorial.curatorIds) {
                const ownerUid = memorial.curatorId;
                try {
                    const userRecord = await admin.auth().getUser(ownerUid);
                    const updateData = { curators: [{ uid: userRecord.uid, email: userRecord.email }], curatorIds: [userRecord.uid] };
                    batch.update(doc.ref, updateData);
                    migrationCount++;
                } catch (userError) {
                    console.warn(`Could not find user for UID ${ownerUid} on memorial ${doc.id}. Skipping.`);
                }
            }
        }
        if (migrationCount === 0) {
            res.status(200).send("All memorials with a 'curatorId' field were already up to date. No migration needed.");
            return;
        }
        await batch.commit();
        res.status(200).send(`Successfully migrated ${migrationCount} memorials.`);
    } catch (error) {
        console.error("Migration failed:", error);
        res.status(500).send("An error occurred during migration.");
    }
});
exports.suggestPinUpdate = onCall(async (request) => {
    initializeApp();
    db = db || admin.firestore();
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in to suggest an update.");
    const { memorialId, location } = request.data;
    if (!memorialId || !location || !location.lat || !location.lng) {
        throw new HttpsError("invalid-argument", "Missing memorialId or location data.");
    }
    const suggesterUid = request.auth.uid;
    const suggestion = {
        suggestedBy: suggesterUid,
        location: new admin.firestore.GeoPoint(location.lat, location.lng),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending'
    };
    await db.collection('memorials').doc(memorialId).collection('suggestedLocations').add(suggestion);
    return { success: true, message: "Suggestion submitted successfully." };
});
exports.approvePinUpdate = onCall(async (request) => {
    initializeApp();
    db = db || admin.firestore();
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const { memorialId, suggestionId } = request.data;
    if (!memorialId || !suggestionId) {
        throw new HttpsError("invalid-argument", "Missing memorialId or suggestionId.");
    }
    const callerUid = request.auth.uid;
    const memorialRef = db.collection('memorials').doc(memorialId);
    const suggestionRef = memorialRef.collection('suggestedLocations').doc(suggestionId);
    return db.runTransaction(async (transaction) => {
        const memorialDoc = await transaction.get(memorialRef);
        const suggestionDoc = await transaction.get(suggestionRef);
        if (!memorialDoc.exists || !suggestionDoc.exists) {
            throw new HttpsError("not-found", "Memorial or suggestion not found.");
        }
        const isCurator = memorialDoc.data().curatorIds?.includes(callerUid);
        if (!isCurator) {
            throw new HttpsError("permission-denied", "You do not have permission to approve this suggestion.");
        }
        const newLocation = suggestionDoc.data().location;
        transaction.update(memorialRef, { location: newLocation });
        transaction.update(suggestionRef, { status: 'approved' });
        return { success: true, message: "Pin location updated successfully." };
    });
});
exports.addCurator = onCall(async (request) => {
    initializeApp();
    db = db || admin.firestore();
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const { memorialId, inviteeEmail } = request.data;
    const callerUid = request.auth.uid;
    if (!memorialId || !inviteeEmail) throw new HttpsError("invalid-argument", "Missing data.");
    const memorialRef = db.collection("memorials").doc(memorialId);
    const memorialDoc = await memorialRef.get();
    if (!memorialDoc.exists) throw new HttpsError("not-found", "Memorial not found.");
    const memorialData = memorialDoc.data();
    if (memorialData.curatorId && !memorialData.curators) {
        const owner = await admin.auth().getUser(memorialData.curatorId);
        memorialData.curators = [{ uid: owner.uid, email: owner.email }];
        memorialData.curatorIds = [owner.uid];
    }
    const isCallerACurator = memorialData.curatorIds?.includes(callerUid);
    if (!isCallerACurator) throw new HttpsError("permission-denied", "You do not have permission.");
    let inviteeUser;
    try {
        inviteeUser = await admin.auth().getUserByEmail(inviteeEmail);
    } catch (error) {
        throw new HttpsError("not-found", `No user account found for email: ${inviteeEmail}.`);
    }
    const isAlreadyCurator = memorialData.curatorIds?.includes(inviteeUser.uid);
    if (isAlreadyCurator) throw new HttpsError("already-exists", "This user is already a curator.");
    const newCurator = { uid: inviteeUser.uid, email: inviteeUser.email };
    await memorialRef.update({
        curators: admin.firestore.FieldValue.arrayUnion(newCurator),
        curatorIds: admin.firestore.FieldValue.arrayUnion(inviteeUser.uid)
    });
    return { message: "Curator added successfully!", newCurator };
});
exports.removeCurator = onCall(async (request) => {
    initializeApp();
    db = db || admin.firestore();
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const { memorialId, curatorToRemove } = request.data;
    const callerUid = request.auth.uid;
    const memorialRef = db.collection("memorials").doc(memorialId);
    const memorialDoc = await memorialRef.get();
    const memorialData = memorialDoc.data();
    if (!memorialData.curators || !memorialData.curatorIds) throw new HttpsError("failed-precondition", "This memorial does not support multiple curators.");
    if (!memorialData.curatorIds.includes(callerUid)) throw new HttpsError("permission-denied", "You do not have permission.");
    if (memorialData.curatorIds[0] === curatorToRemove.uid) throw new HttpsError("permission-denied", "The primary curator cannot be removed.");
    await memorialRef.update({
        curators: admin.firestore.FieldValue.arrayRemove(curatorToRemove),
        curatorIds: admin.firestore.FieldValue.arrayRemove(curatorToRemove.uid)
    });
    return { message: "Curator removed successfully." };
});
exports.createSquarePaymentLink = onCall({ secrets: [squareAccessToken] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in to place an order.");
    if (!squareClient) {
        squareClient = new Client({
            accessToken: squareAccessToken.value(),
            environment: Environment.Sandbox,
        });
    }
    const { memorialId, memorialName } = request.data;
    const userId = request.auth.uid;
    try {
        const response = await squareClient.checkoutApi.createPaymentLink({
            idempotencyKey: new Date().toISOString(),
            order: {
                locationId: SQUARE_LOCATION_ID,
                lineItems: [{
                    name: "Headstone Legacy QR Tag",
                    quantity: '1',
                    basePriceMoney: { amount: 2999, currency: 'USD' }
                }],
                referenceId: JSON.stringify({ memorialId, userId })
            },
            checkoutOptions: {
                allowTipping: false,
                redirectUrl: `${request.headers.origin}/memorial?id=${memorialId}&order=success`,
                askForShippingAddress: true
            }
        });
        return { url: response.result.paymentLink.url, orderId: response.result.paymentLink.orderId };
    } catch (error) {
        console.error("Square API error:", error);
        throw new HttpsError("internal", "An error occurred while creating the payment link.");
    }
});
exports.geocodeAddress = onCall({ secrets: [mapboxToken] }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const mapboxClient = mbxGeocoding({ accessToken: mapboxToken.value() });
    const address = request.data.address;
    if (!address) throw new HttpsError("invalid-argument", "A valid 'address' is required.");
    try {
        const response = await mapboxClient.forwardGeocode({ query: address, limit: 1 }).send();
        if (!response.body.features || response.body.features.length === 0) {
            throw new HttpsError("not-found", `No results found for address.`);
        }
        const [lng, lat] = response.body.features[0].center;
        return { lat, lng };
    } catch (error) {
        console.error(`Geocoding failed for "${address}"`, error.message);
        throw new HttpsError("internal", "An error occurred during geocoding.");
    }
});
exports.transcribeHeadstoneImage = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    if (!visionClient) visionClient = new vision.ImageAnnotatorClient();
    const imageUrl = request.data.imageUrl;
    if (!imageUrl) throw new HttpsError("invalid-argument", "A valid 'imageUrl' is required.");
    try {
        const [result] = await visionClient.textDetection(imageUrl);
        const text = result.textAnnotations.length > 0 ? result.textAnnotations[0].description : "";
        return { text };
    } catch (error) {
        console.error("Error transcribing image:", imageUrl, error);
        throw new HttpsError("internal", "An error occurred during transcription.");
    }
});
exports.generateBioFromPrompts = onCall((request) => {
    console.log("generateBioFromPrompts called with:", request.data);
    return { bio: "This is a sample AI-generated biography." };
});