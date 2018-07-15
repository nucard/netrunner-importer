const rawData = require('./data/AllSets.json');
const _ = require('lodash');
const firebase = require('firebase-admin');
const firebaseKey = require('./firebase-key.json');
const IndexingService = require('./services/indexing.service');

firebase.initializeApp({
    credential: firebase.credential.cert(firebaseKey)
});
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

function getCardSearchId(cardName) {
    return cardName
        .toLowerCase()
        .split(' ')
        .join('');
}

function loadCardData() {
    const cards = {};

    for (const setCode of _.keys(rawData)) {
        const setCards = rawData[setCode].cards;

        for (let setCard of setCards) {
            let card = cards[setCard.name];

            // if this isn't a card we've hit before, we need to add an entry
            if (!card) {
                const newCard = {
                    id: setCard.id,
                    searchId: getCardSearchId(setCard.name), // for algolia search
                    name: setCard.name,
                    rarity: setCard.rarity,
                    cost: setCard.manaCost || null,
                    types: (setCard.supertypes || []).concat(setCard.types || []),
                    subtypes: setCard.subtypes || [],
                    text: setCard.text || null,
                    thumbnail: setCard.multiverseid ?
                        `http://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${setCard.multiverseid}&type=card` :
                        null,
                    printings: []
                };

                cards[setCard.name] = newCard;
                card = newCard;
            }

            // add the printing to the entry
            card.printings.push({
                artist: setCard.artist,
                flavorText: setCard.flavor || null,
                image: setCard.multiverseid ?
                    `http://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${setCard.multiverseid}&type=card` :
                    null,
                printedIn: setCode
            });
        }
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
            objectID: getCardSearchId(card.name),
            flavorText: card.flavorText,
            text: card.text,
        });
    }

    const indexingService = new IndexingService();
    await indexingService.addToIndex('cards', cardsToIndex.slice(0, 5000));
}

(async () => {
    const cards = loadCardData();
    // await deleteAllCards();
    // await importCards(cards);
    await createSearchIndex(cards);
})();
