const algoliaSearch = require('algoliasearch');
const config = require('../config');

module.exports = class IndexingService {
    constructor() {
        this._client = algoliaSearch(config.algoliaAppId, config.algoliaApiKey);
    }

    addToIndex(indexName, objects) {
        console.log(`Creating index "${indexName}" for ${objects.length} objects...`);
        this._index = this._client.initIndex(indexName);
        return this._index.saveObjects(objects);
    }
}
