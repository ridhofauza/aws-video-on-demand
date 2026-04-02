/*********************************************************************************************************************
 *
 * Adding new code to make endpoint API Gateway
 *                                                                          *
 *********************************************************************************************************************/
const {
  APIGatewayClient,
  CreateRestApiCommand,
  GetResourcesCommand,
  CreateResourceCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  CreateDeploymentCommand,
  DeleteRestApiCommand,
  GetRestApisCommand,
} = require("@aws-sdk/client-api-gateway");

const ENDPOINT_RESOURCE = "drm";
const SPEKE_VERSION_HEADER = "X-Speke-Version";
const SPEKE_VERSION_VALUE = "2.0";
const AUTHORIZATION_HEADER = "Authorization";

// Encode
const toBase64 = (str) => Buffer.from(str, "utf-8").toString("base64");

const createEndpointDRMProvider = async (properties) => {
  try {
    const AUTHORIZATION_VALUE = toBase64(`${properties.TenantIdDRM}:${properties.KeyServiceManagementKeyDRM}`);
    const client = new APIGatewayClient({ region: properties.Region });

    // 1. Create Rest API
    const api = await client.send(new CreateRestApiCommand({
      name: properties.ApiGatewayName,
      description: "Proxy to DRM Provider"
    }));

    const restApiId = api.id;
    console.log("Rest API ID:", restApiId);

    // 2. Get root resource
    const resources = await client.send(new GetResourcesCommand({
      restApiId
    }));

    const rootId = resources.items.find(r => r.path === "/").id;

    // 3. Create endpoint resource
    const resource = await client.send(new CreateResourceCommand({
      restApiId,
      parentId: rootId,
      pathPart: ENDPOINT_RESOURCE
    }));

    const resourceId = resource.id;

    // 4. Create POST method
    await client.send(new PutMethodCommand({
      restApiId,
      resourceId,
      httpMethod: "POST",
      authorizationType: "NONE"
    }));

    // 5. HTTP Proxy Integration to DRM Provider
    if (properties.EnableSpekeV2 === 'true') {
      await client.send(new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod: "POST",
        type: "HTTP_PROXY",
        integrationHttpMethod: "POST",
        uri: properties.EndpointDRM,
        requestParameters: {
          [`integration.request.header.${SPEKE_VERSION_HEADER}`]: `'${SPEKE_VERSION_VALUE}'`,
          [`integration.request.header.${AUTHORIZATION_HEADER}`]: `'Basic ${AUTHORIZATION_VALUE}'`,
        },
      }));
    } else {
      await client.send(new PutIntegrationCommand({
        restApiId,
        resourceId,
        httpMethod: "POST",
        type: "HTTP_PROXY",
        integrationHttpMethod: "POST",
        uri: properties.EndpointDRM,
        requestParameters: {          
          [`integration.request.header.${AUTHORIZATION_HEADER}`]: `'Basic ${AUTHORIZATION_VALUE}'`,
        },
      }));
    }

    // 6. Deploy API
    await client.send(new CreateDeploymentCommand({
      restApiId,
      stageName: "prod"
    }));

    console.log("API deployed!");
    let resultUrl = `https://${restApiId}.execute-api.${properties.Region}.amazonaws.com/prod/${ENDPOINT_RESOURCE}`;
    console.log(`Endpoint: ${resultUrl}`);

    return {
      EndpointApiGatewayUrl: resultUrl
    };

  } catch (err) {
    console.error(err);
  }
}

const deleteEndpointDRMProvider = async (properties) => {
  const client = new APIGatewayClient({ region: properties.Region });

  try {
    const restApiId = await resolveRestApiId(client, properties);

    if (!restApiId) {
      console.warn("[deleteEndpointDRMProvider] No REST API found to delete. Skipping.");
    }

    console.log(`[deleteEndpointDRMProvider] Deleting REST API: ${restApiId}`);

    await client.send(new DeleteRestApiCommand({ restApiId }));

    console.log(`[deleteEndpointDRMProvider] Successfully deleted REST API: ${restApiId}`);

  } catch (err) {
    // If the API is already gone, treat it as success (idempotent rollback)
    if (err.name === "NotFoundException") {
      console.warn(`[deleteEndpointDRMProvider] REST API not found (already deleted?). Treating as success.`);
    }

    // Re-throw anything else so CloudFormation marks the operation as failed
    console.error("[deleteEndpointDRMProvider] Error deleting REST API:", err);
    throw err;
  }
};

const resolveRestApiId = async (client, properties) => {
  // Fallback: scan by name (handles cases where the ID wasn't persisted)
  const apiName = properties.ApiGatewayName;
  console.log(`[resolveRestApiId] No RestApiId provided, searching by name: "${apiName}"`);

  let position;
  do {
    const response = await client.send(
      new GetRestApisCommand({ limit: 500, position })
    );

    const match = response.items?.find((api) => api.name === apiName);
    if (match) {
      console.log(`[resolveRestApiId] Found API "${apiName}" with ID: ${match.id}`);
      return match.id;
    }

    position = response.position; // next page token
  } while (position);

  return null; // not found
};

module.exports = {
  createEndpointDRMProvider,
  deleteEndpointDRMProvider
};