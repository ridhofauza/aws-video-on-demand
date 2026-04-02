/*********************************************************************************************************************
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

const { MediaPackageVod } = require("@aws-sdk/client-mediapackage-vod");
const crypto = require('crypto');
const cloudfrontHelper = require('./cloudfront');

const DEFAULT_SEGMENT_LENGTH = 6;
const DEFAULT_PROGRAM_DATETIME_INTERVAL = 60;
const DEFAULT_MANIFEST_NAME = 'index';

const getDrmEncryptionHls = (urlApiGatewayDRMProvider, roleArnMediaPackage, resourceId) => ({
    SpekeKeyProvider: {
        ResourceId: resourceId,
        SystemIds: [
            "94ce86fb-07ff-4f43-adb8-93d2fa968ca2"  // FairPlay
        ],
        Url: urlApiGatewayDRMProvider,
        RoleArn: roleArnMediaPackage
    }
});

const getDrmEncryptionDash = (urlApiGatewayDRMProvider, roleArnMediaPackage, resourceId) => ({
    SpekeKeyProvider: {
        ResourceId: resourceId,
        SystemIds: [
            "edef8ba9-79d6-4ace-a3c8-27dcd51d21ed", // Widevine
            "9a04f079-9840-4286-ab92-e65be0885f95" // PlayReady
        ],
        Url: urlApiGatewayDRMProvider,
        RoleArn: roleArnMediaPackage
    }
});

const getDrmEncryptionMss = (urlApiGatewayDRMProvider, roleArnMediaPackage, resourceId) => ({
    SpekeKeyProvider: {
        ResourceId: resourceId,
        SystemIds: [
            "9a04f079-9840-4286-ab92-e65be0885f95" // PlayReady
        ],
        Url: urlApiGatewayDRMProvider,
        RoleArn: roleArnMediaPackage
    }
});

const getDrmEncryptionCmaf = (urlApiGatewayDRMProvider, roleArnMediaPackage, resourceId) => ({
    SpekeKeyProvider: {
        ResourceId: resourceId,
        SystemIds: [
            "edef8ba9-79d6-4ace-a3c8-27dcd51d21ed", // Widevine
            "9a04f079-9840-4286-ab92-e65be0885f95", // PlayReady
            "94ce86fb-07ff-4f43-adb8-93d2fa968ca2"  // FairPlay
        ],
        Url: urlApiGatewayDRMProvider,
        RoleArn: roleArnMediaPackage
    }
});

const getHlsParameters = (urlApiGatewayDRMProvider, mediaPackageVodRole, groupId, configId) => ({
    Id: configId,
    PackagingGroupId: groupId,
    HlsPackage: {
        Encryption: getDrmEncryptionHls(urlApiGatewayDRMProvider, mediaPackageVodRole, configId),
        HlsManifests: [{
            AdMarkers: 'SCTE35_ENHANCED',
            IncludeIframeOnlyStream: false,
            ManifestName: DEFAULT_MANIFEST_NAME,
            ProgramDateTimeIntervalSeconds: DEFAULT_PROGRAM_DATETIME_INTERVAL,
            RepeatExtXKey: false
        }],
        SegmentDurationSeconds: DEFAULT_SEGMENT_LENGTH,
        UseAudioRenditionGroup: true
    }
});

const getDashParameters = (urlApiGatewayDRMProvider, mediaPackageVodRole, groupId, configId) => ({
    Id: configId,
    PackagingGroupId: groupId,
    DashPackage: {
        Encryption: getDrmEncryptionDash(urlApiGatewayDRMProvider, mediaPackageVodRole, configId),
        DashManifests: [{
            ManifestName: DEFAULT_MANIFEST_NAME,
            MinBufferTimeSeconds: DEFAULT_SEGMENT_LENGTH * 3,
            Profile: 'NONE'
        }],
        SegmentDurationSeconds: DEFAULT_SEGMENT_LENGTH
    }
});

const getMssParameters = (urlApiGatewayDRMProvider, mediaPackageVodRole, groupId, configId) => ({
    Id: configId,
    PackagingGroupId: groupId,
    MssPackage: {
        Encryption: getDrmEncryptionMss(urlApiGatewayDRMProvider, mediaPackageVodRole, configId),
        MssManifests: [{
            ManifestName: DEFAULT_MANIFEST_NAME
        }],
        SegmentDurationSeconds: DEFAULT_SEGMENT_LENGTH
    }
});

const getCmafParameters = (urlApiGatewayDRMProvider, mediaPackageVodRole, groupId, configId) => ({
    Id: configId,
    PackagingGroupId: groupId,
    CmafPackage: {
        Encryption: getDrmEncryptionCmaf(urlApiGatewayDRMProvider, mediaPackageVodRole, configId),
        HlsManifests: [{
            AdMarkers: 'SCTE35_ENHANCED',
            IncludeIframeOnlyStream: false,
            ManifestName: DEFAULT_MANIFEST_NAME,
            ProgramDateTimeIntervalSeconds: DEFAULT_PROGRAM_DATETIME_INTERVAL,
            RepeatExtXKey: false
        }],
        SegmentDurationSeconds: DEFAULT_SEGMENT_LENGTH
    }
});

const create = async (properties) => {
    const mediaPackageVod = new MediaPackageVod({customUserAgent: process.env.SOLUTION_IDENTIFIER});
    const randomId = crypto.randomBytes(8).toString('hex');

    let groupParams = {
        Id: properties.GroupId,
        Tags: {'SolutionId': 'SO0021'}
    };
    
    const packagingGroup = await mediaPackageVod.createPackagingGroup(groupParams);
    let created = false;

    const configurations = Array.from(new Set(properties.PackagingConfigurations.split(',')));
    for (let config of configurations) {
        let params = {};

        switch (config.toLowerCase()) {
            case 'hls':
                params = getHlsParameters(properties.UrlApiGatewayDRMProvider, properties.MediaPackageVodRole, packagingGroup.Id, `packaging-config-${randomId}-hls`);
                break;

            case 'dash':
                params = getDashParameters(properties.UrlApiGatewayDRMProvider, properties.MediaPackageVodRole, packagingGroup.Id, `packaging-config-${randomId}-dash`);
                break;

            case 'mss':
                params = getMssParameters(properties.UrlApiGatewayDRMProvider, properties.MediaPackageVodRole, packagingGroup.Id, `packaging-config-${randomId}-mss`);
                break;

            case 'cmaf':
                params = getCmafParameters(properties.UrlApiGatewayDRMProvider, properties.MediaPackageVodRole, packagingGroup.Id, `packaging-config-${randomId}-cmaf`);
                break;

            default:
                console.log(`Unknown packaging configuration: ${config}`);
                params = null;
                break;
        }

        if (params) {
            params.Tags = {'SolutionId': 'SO0021'};
            console.log(`Creating configuration:: ${JSON.stringify(params, null, 2)}`);
            await mediaPackageVod.createPackagingConfiguration(params);
            created = true;
        }
    }

    if (!created) {
        throw new Error('At least one valid packaging configuration must be informed.');
    }

    await cloudfrontHelper.addCustomOrigin(properties.DistributionId, packagingGroup.DomainName);

    return {
        GroupId: packagingGroup.Id,
        GroupDomainName: packagingGroup.DomainName
    };
};

const update = async (properties) => {
    const mediaPackageVod = new MediaPackageVod({customUserAgent: process.env.SOLUTION_IDENTIFIER});
    const packagingGroup = await mediaPackageVod.describePackagingGroup({ Id: properties.GroupId });

    if (properties.EnableMediaPackage == 'true') {
        await cloudfrontHelper.addCustomOrigin(properties.DistributionId, packagingGroup.DomainName);
    }

    return {
        GroupId: packagingGroup.Id,
        GroupDomainName: packagingGroup.DomainName
    };
};

const purge = async (properties) => {
    const mediaPackageVod = new MediaPackageVod({customUserAgent: process.env.SOLUTION_IDENTIFIER});
    const groupId = properties.GroupId;
    let token;

    do {
        const response = await mediaPackageVod.listAssets({ PackagingGroupId: groupId, NextToken: token });

        for (let asset of response.Assets) {
            await mediaPackageVod.deleteAsset({ Id: asset.Id });
            console.log(`Deleted asset:: ${asset.Id}`);
        }

        token = response.NextToken;
    } while (token);

    do {
        const response = await mediaPackageVod.listPackagingConfigurations({ PackagingGroupId: groupId, NextToken: token });

        for (let config of response.PackagingConfigurations) {
            await mediaPackageVod.deletePackagingConfiguration({ Id: config.Id });
            console.log(`Deleted configuration:: ${config.Id}`);
        }

        token = response.NextToken;
    } while (token);

    try {
        await mediaPackageVod.deletePackagingGroup({ Id: groupId });
        console.log(`Deleted group:: ${groupId}`);
    } catch (error) {
        if (error.code !== 'NotFoundException') {
            throw error;
        }
    }

    return {
        GroupId: groupId
    };
};

module.exports = {
    create,
    update,
    purge
};
