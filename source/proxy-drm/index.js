const { DynamoDBDocument } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const axios = require("axios");
const { DOMParser } = require("@xmldom/xmldom");

exports.handler = async (event, context) => {
    try {
        const requestBody = event.body;
        const kidSet = new Set();
        const resourceIdSet = new Set();

        // Parse XML
        const doc = new DOMParser().parseFromString(requestBody, "text/xml");

        // Extract resourceId
        const cpixElements = doc.getElementsByTagName("cpix:CPIX");
        for (let i = 0; i < cpixElements.length; i++) {
            if (process.env.SPEKE_VERSION === "2") {
                resourceIdSet.add(cpixElements[i].getAttribute("contentId"));
            } else {
                resourceIdSet.add(cpixElements[i].getAttribute("id"));
            }
            console.log("Resource ID:", [...resourceIdSet]);
        }

        // Extract keyId (kid)
        const contentKeyElements = doc.getElementsByTagName("cpix:ContentKey");
        for (let i = 0; i < contentKeyElements.length; i++) {
            kidSet.add(contentKeyElements[i].getAttribute("kid"));
            console.log("keyId:", [...kidSet]);
        }

        // SPEKE endpoint
        const spekeEndpoint = process.env.SPEKE_URL;
        const authorizationHeader = `Basic ${process.env.SPEKE_AUTH_HEADER}`; // Basic base64("TenantID:ManagementKey")

        let headers = {
            "Authorization": authorizationHeader,
            "Content-Type": "text/xml",
            "X-Speke-Version": `${process.env.SPEKE_VERSION}.0`
        };

        console.log(`SPEKE_VERSION:: ${process.env.SPEKE_VERSION}`);

        // Store Key Id and Content Id to DynamoDB
        const extractedContentKey = {
            contentKey: {
                contentId: [...resourceIdSet][0],
                kid: [...kidSet]
            }
        }

        const dynamo = DynamoDBDocument.from(new DynamoDBClient({ 
            region: process.env.AWS_REGION,
            customUserAgent: process.env.SOLUTION_IDENTIFIER
        }));

        let params = {
            TableName: process.env.DYNAMO_DB_TABLE,
            Key: {
                resourceId: extractedContentKey.contentKey.contentId,
            },
            UpdateExpression: 'set contentKey = :1',
            ExpressionAttributeValues: { ":1": extractedContentKey.contentKey }
        };

        console.log(`WRITE_DYNAMODB:: ${JSON.stringify(params)}`);
        await dynamo.update(params);

        console.log(`EXTRACTED_CONTENT_KEY:: ${JSON.stringify(extractedContentKey)}`);


        // POST request
        const response = await axios.post(spekeEndpoint, requestBody, {
            headers: headers
        });

        // Return response
        return {
            statusCode: response.status,
            headers: response.headers,
            body: response.data
        };

    } catch (error) {
        console.log(`ERROR-BODY:: ${error.response?.data || JSON.stringify(error.message)}`);
        console.log(`ERROR-CODE:: ${error.response?.status || 500}`);

        return {
            statusCode: error.response?.status || 500,
            headers: null,
            body: error.response?.data || JSON.stringify(error.message)
        };
    }
};