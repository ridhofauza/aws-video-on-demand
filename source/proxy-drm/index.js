const { DynamoDBDocument } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const axios = require("axios");
const { DOMParser } = require("@xmldom/xmldom");

exports.handler = async (event, context) => {
    try {
        const requestBody = event.body;
        const kidSet = new Set();
        const resourceIdSet = new Set();
        let versionSpeke = "1"; //default SPEKE v1

        // Parse XML
        const doc = new DOMParser().parseFromString(requestBody, "text/xml");
        const cpixElements = doc.getElementsByTagName("cpix:CPIX");

        //Extract version SPEKE
        for (let i = 0; i < cpixElements.length; i++) {
            versionSpeke = cpixElements[i]?.getAttribute("version") ?? "1";
            versionSpeke = versionSpeke[0];
            console.log("SPEKE Version:", versionSpeke);
        }

        // Extract resourceId
        for (let i = 0; i < cpixElements.length; i++) {
            if (versionSpeke === "2") {
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
        const spekeEndpoint = versionSpeke === "2" ? process.env.SPEKE_URL_2 : process.env.SPEKE_URL_1;
        const authorizationHeader = `Basic ${process.env.SPEKE_AUTH_HEADER}`; // Basic base64("TenantID:ManagementKey")

        let headers = {
            "Authorization": authorizationHeader,
            "Content-Type": "text/xml",
            "X-Speke-Version": `${versionSpeke}.0`
        };

        // Store Key Id and Content Id to DynamoDB
        let updateExpressionCmd = "";
        let contentKey = {};
        if (versionSpeke === "2") {
            updateExpressionCmd = "set contentKeySpekeV2 = :1";
            contentKey = {
                kid: [...kidSet]
            }
        } else {
            updateExpressionCmd = "set contentKeySpekeV1 = :1";
            contentKey = {
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
                resourceId: [...resourceIdSet][0],
            },
            UpdateExpression: updateExpressionCmd,
            ExpressionAttributeValues: { ":1": contentKey }
        };

        console.log(`WRITE_DYNAMODB:: ${JSON.stringify(params)}`);
        await dynamo.update(params);

        console.log(`EXTRACTED_CONTENT_KEY:: ${JSON.stringify(contentKey)}`);


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