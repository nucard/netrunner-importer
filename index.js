const rawData = require('./data/cards.json');
const _ = require('lodash');
const firebase = require('firebase-admin');
const firebaseKey = require('./firebase-key.json');
const IndexingService = require('./services/indexing.service');

firebase.initializeApp({ credential: firebase.credential.cert(firebaseKey) });
const db = firebase.firestore();

function getAllCards() {
    return new Promise((resolve, reject) => {
        db
            .collection('cards')
            .get()
            .then(snapshot => {
                resolve(snapshot.docs);
            });
    });
}

function deleteAllCards() {
    return new Promise((resolve, reject) => {
        getAllCards()
            .then(docs => {
                const batch = db.batch();

                console.log(`Deleting ${docs.length} cards...`);
                docs.forEach(doc => {
                    batch.delete(doc.ref);
                });

                batch.commit().then(() => {
                    console.log(`Done deleting.`);
                    resolve();
                });
            });
    })
}

function loadCardData() {
    const cards = [];
    const imageTemplate = rawData.imageUrlTemplate;

    for (const rawCard of rawData.data) {
        let card = {
            id: rawCard.code,
            name: rawCard.title,
            faction: rawCard.faction_code,
            cost: (rawCard.cost ? `${rawCard.cost}[credit]` : `0`),
            types: `${rawCard.type_code.substring(0, 1).toUpperCase()}${rawCard.type_code.substring(1)}`,
            subtypes: (rawCard.keywords ? rawCard.keywords.split(' - ') : []),
            text: rawCard.text || null,
            printings: [{
                artist: rawCard.illustrator || 'Unknown',
                flavorText: rawCard.flavor || null,
                image: rawCard.image_url || null
            }]
        };

        cards.push(card);
    }

    console.log(`Loaded ${cards.length} cards from raw data...`);
    return _.values(cards);
}

function importCards(cards) {
    return new Promise((resolve, reject) => {
        const allBatches = [];
        let batch = db.batch();
        let batchCounter = 0;
        console.log(`Adding ${cards.length} cards...`);

        for (let i = 0; i < cards.length; i++) {
            console.log(i);
            const cardRef = db.collection('cards').doc(cards[i].id);

            batch.set(cardRef, cards[i]);
            batchCounter++;

            if (batchCounter === 500 || i === cards.length - 1) {
                allBatches.push(batch);
                batch = db.batch();
                batchCounter = 0;
            }
        }

        for (let batch of allBatches) {
            batch.commit();
        }

        console.log('Done.');
        resolve();
    });
}

async function createSearchIndex(cards) {
    const cardsToIndex = [];

    for (const card of cards) {
        cardsToIndex.push({
            // assign cards an objectID (note spelling) for algolia
            name: card.name,
            objectID: card.id,
            flavorText: card.flavorText,
            text: card.text,
        });
    }

    const indexingService = new IndexingService();
    await indexingService.addToIndex('cards', cardsToIndex);
}

(async () => {
    const cards = loadCardData();
    // await deleteAllCards();
    // await importCards(cards);
    // await createSearchIndex(cards);
})();
