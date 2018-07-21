const NodeRequest = require('request');
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

async function getPacks() {
    return new Promise((resolve, reject) => {
        NodeRequest.get('https://netrunnerdb.com/api/2.0/public/packs', (error, response, body) => {
            if (error) reject(error);

            resolve(JSON.parse(body).data);
        });
    });
}

async function getCycles() {
    return new Promise((resolve, reject) => {
        NodeRequest.get('https://netrunnerdb.com/api/2.0/public/cycles', (error, response, body) => {
            if (error) reject(error);

            resolve(JSON.parse(body).data);
        });
    });
}

async function loadCardData() {
    const cards = [];

    const packs = await getPacks();
    const cycles = await getCycles();

    const imageTemplate = rawData.imageUrlTemplate;

    for (const rawCard of rawData.data) {
        let card = cards.find(c => c.name === rawCard.title);

        if (!card) {
            card = {
                id: rawCard.code,
                name: rawCard.title,
                factionId: rawCard.faction_code,
                cost: (rawCard.cost ? `${rawCard.cost}[credit]` : `0`),
                types: [`${rawCard.type_code.substring(0, 1).toUpperCase()}${rawCard.type_code.substring(1)}`],
                subtypes: (rawCard.keywords ? rawCard.keywords.split(' - ') : []),
                text: rawCard.text || null,
                printings: [],
            };

            // add identity extra attrs if appropriate
            if (rawCard.type_code === 'identity') {
                card.extraAttributes = [{
                    name: 'Deck size minimum / Influence',
                    value: `${rawCard.minimum_deck_size} / ${rawCard.influence_limit || '--'}`,
                }];
            }

            cards.push(card);
        }

        // get printed in pack
        const printedInPack = packs.find(p => p.code === rawCard.pack_code);
        const printedInCycle = cycles.find(c => c.code === printedInPack.cycle_code);

        const printing = {
            artist: rawCard.illustrator || 'Unknown',
            flavorText: rawCard.flavor || null,
            image: rawCard.image_url || `https://netrunnerdb.com/card_image/${rawCard.code}.png`,
            printedIn: `${printedInPack.name}`,
        };

        // only append the cycle in parentheses if it's not equal to the pack name (like core set is)
        if (printedInCycle && printedInCycle.name !== printing.printedIn) {
            printing.printedIn = `${printing.printedIn} (${printedInCycle.name})`;
        }

        card.printings.push(printing);
    }

    console.log(`Loaded ${cards.length} cards from raw data...`);
    return cards;
}

function importCards(cards) {
    return new Promise((resolve, reject) => {
        const allBatches = [];
        let batch = db.batch();
        let batchCounter = 0;
        console.log(`Adding ${cards.length} cards...`);

        for (let i = 0; i < cards.length; i++) {
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
    const cards = await loadCardData();
    // await deleteAllCards();
    await importCards(cards);
    // await createSearchIndex(cards);
})();
