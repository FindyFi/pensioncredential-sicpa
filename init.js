import sqlite3 from 'sqlite3'
import config from './config.json' with {type: 'json'}
import auth from './auth.js'

const credentialName = 'pensionCredential'

const issuerName = 'Kela'
const issuerLogo = 'https://www.kela.fi/documents/20124/410402/logo-kela-rgb.png/50cdb366-b094-027e-2ac2-0439af6dc529?t=1643974848905'
const verifierName = 'HSL'
const verifierLogo = 'https://cdn-assets-cloud.frontify.com/s3/frontify-cloud-files-us/eyJwYXRoIjoiZnJvbnRpZnlcL2FjY291bnRzXC8yZFwvMTkyOTA4XC9wcm9qZWN0c1wvMjQ5NjY1XC9hc3NldHNcL2UzXC80NTY4ODQ2XC9lMjY2Zjg2NTU1Y2VjMGExZGM4ZmVkNDRiODdiMTNjNi0xNTk1NDI5MTAxLnN2ZyJ9:frontify:B-Us_1Aj3DJ5FKHvjZX1S0UOpg5wCFDIv4CNfy6rXQY?width=2400'

// override config file with environment variables
for (const param in config) {
    if (process.env[param] !== undefined) {
        config[param] = process.env[param]
    }
}

const auth_token = await auth()
const jsonHeaders = {
    'Authorization': auth_token,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
}

const db = await openDB()
const roles = await initRoles()
const profileId = await initProfiles()
const templateId = await initTemplates()
// console.log( { config, db, jsonHeaders, roles, profileId, templateId })
export { config, db, jsonHeaders, roles, profileId, templateId, credentialName }

function openDB() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(config.db_file, (err) => {
            if (err) reject(err.message)
            // console.log(`Connected to the database '${config.db_file}'.`)
            const create = `CREATE TABLE IF NOT EXISTS organizations (
                id char(36) PRIMARY KEY,
                publicId char(36),
                name varchar(50),
                keyId char(36),
                did VARCHAR(500),
                identityId char(36),
                role varchar(20)
            );`
            db.run(create, (err) => {
                if (err) reject(err.message)
                resolve(db)
            })
        })
    })
}

function initRoles() {
    return new Promise((resolve, reject) => {
        const insertOrganization = db.prepare("REPLACE INTO organizations (id, publicId, name, did, role) VALUES (?, ?, ?, ?, ?);")
        const selectOrganizations = "SELECT id, publicId, name, keyId, did, identityId, role FROM organizations;"
        const updateOrganization = "UPDATE organizations SET keyId = $keyID, did = $did, identityId = $identityId WHERE id = $id;"
        const roles = {}
        db.all(selectOrganizations, [], async (err, rows) => {
            if (err) throw err
            rows.forEach((row) => {
                roles[row.role] = row
            })
            if (roles.issuer && roles.issuer.did && roles.verifier.did) {
                resolve(roles)
                return
            }
            const createOrganizationUrl = `${config.credentials_api}/agents`
            const generateKeyUrl = `${config.credentials_api}/kms/providers/local/generate-key`
            const createDIDUrl = `${config.credentials_api}/identity/dids`
            const createWebhookUrl = `${config.credentials_api}/webhooks`
            for (let role of ['issuer', 'verifier']) {
                if (!roles[role]) {
                    const orgParams = {
                        method: 'POST',
                        headers: jsonHeaders,
                        body: JSON.stringify({
                            "name": role == 'issuer' ? issuerName : verifierName,
                            "imageUrl": role == 'issuer' ? issuerLogo : verifierLogo,
                        })
                    }
                    const resp = await fetch(createOrganizationUrl, orgParams)
                    const org = await resp.json()
                    // console.log(resp.status, createOrganizationUrl, orgParams, org)
                    // console.log(org)
                    org.role = role
                    insertOrganization.run(org.id, org.publicId, org.name, "", role)
                    roles[role] = org
                }
                if (!roles[role].did) {
                    const keyParams = {
                        method: 'POST',
                        headers: jsonHeaders,
                        body: JSON.stringify({
                            "keyType": "ed25519",
                        })
                    }
                    keyParams.headers['X-AGENT-ID'] = roles[role].id
                    const keyResp = await fetch(generateKeyUrl, keyParams)
                    const keyJson = await keyResp.json()
                    // console.log(keyResp.status, generateKeyUrl, keyParams, keyJson)
                    roles[role].keyId = keyJson.keyId
                    // console.log(roles[role])
                    const didParams = {
                        method: 'POST',
                        headers: jsonHeaders,
                        body: JSON.stringify({
                            "keys": [roles[role].keyId],
                            "method": "web"
                        })
                    }
                    const didResp = await fetch(createDIDUrl, didParams)
                    const didJson = await didResp.json()
                    // console.log(didResp.status, createDIDUrl, didParams, didJson)
                    roles[role].identityId = didJson.id
                    roles[role].did = didJson.did
                    const anchorUrl = `${createDIDUrl}/${didJson.id}/anchoring`
                    const anchorParams = {
                        method: 'POST',
                        headers: jsonHeaders,
                    }
                    anchorParams.headers['X-AGENT-ID'] = roles[role].id
                    const anchorResp = await fetch(anchorUrl, anchorParams)
                    const anchorJson = await anchorResp.json()
                    console.log(`Anchored DID ${anchorJson.did}`)
                    db.run(updateOrganization, [roles[role].keyId, roles[role].did, roles[role].identityId, roles[role].id])
                }
                if (role == 'verifier') {
                    // create webhook to listen
                    const whParams = {
                        method: 'POST',
                        headers: jsonHeaders,
                        body: JSON.stringify({
                            url: config.verifier_public_url + config.verifier_webhook_path,
                            name: "Findynet SICPA verifier",
                            active: true,
                            webhookTypes: ["verification"],
                            destinationAuthentication: null
                        })
                    }
                    const whResp = await fetch(createWebhookUrl, whParams)
                    const whJson = await whResp.json()
                    // console.log(whResp.status, createWebhookUrl, whParams, whJson)
                }
            }
            resolve(roles)
        })
    })
}

async function initProfiles() {
    // see https://docs.dip.sicpa.com/tutorials/profiles/#joining-a-profile-with-sd-jwt-capabilities for profile IDs
    const profileId = '018fcec1-54eb-76dd-adc2-41aa343e1ed3'
    const getInteropProfilesUrl = `${config.credentials_api}/interoperability/profiles/${profileId}/instances`
    const getParams = {
        method: 'GET',
        headers: {
            'Authorization': auth_token,
            'Accept': 'application/json',
            'X-AGENT-ID': roles.issuer.id
        }
    }
    const getResp = await fetch(getInteropProfilesUrl, getParams)
    const instances = await getResp.json()
    if (instances && instances[0]) {
        return instances[0].id

    }
    const joinInteropProfileUrl = `${config.credentials_api}/interoperability/profiles/${profileId}/instances`
    const params = {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(  {
            "identities": [
                roles.issuer.identityId
            ],
            "keys": [
                roles.issuer.keyId
            ]
        })
    }
    params.headers['X-AGENT-ID'] = roles.issuer.id
    const resp = await fetch(joinInteropProfileUrl, params)
    const profileInstance = await resp.json()
    // console.log(resp.status, joinInteropProfileUrl, params, profileInstance)
    return profileInstance.id
}

async function initTemplates() {
    const templateUrl = `${config.credentials_api}/templates`
    const getParams = {
        headers: {
            'Authorization': auth_token,
            'Accept': 'application/json',
            'X-AGENT-ID': roles.issuer.id
        }
    }
    const getResp = await fetch(templateUrl, getParams)
    const list = await getResp.json()
    for (const template of list) {
        if (template.templateName == credentialName) {
            return template.templateId
/*
            const deleteUrl = `${config.credentials_api}/templates/${template.templateId}`
            const params = {
                method: 'DELETE',
                headers: {
                    'Authorization': auth_token,
                    'Accept': 'application/json',
                    'X-AGENT-ID': roles.issuer.id
                }
            }
            const resp = await fetch(deleteUrl, params)
            console.log(resp.status, template.templateId)
*/
        }
    }
    const params = {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
            templateName: credentialName,
            credentialFormats: [
                "SD-JWT-VC"
            ],
            revocable: false,
            claimsJsonSchema: {
                type: "object",
                properties: {
                    Pension: {
                        type: "object",
                        properties: {
                            typeCode: "string",
                            typeName: "string",
                            startDate: "date",
                            endDate: "date",
                            provisional: "boolean"
                       }
                    },
                    Person: {
                        type: "object",
                        properties: {
                            birth_date: "date",
                            given_dame: "string",
                            family_name: "string",
                            personal_administrative_number: "string"
                       },
                    }
                },
                required: ["Pension", "Person"],
                selectiveDisclosures: ["Pension", "Person"],
                additionalProperties: false
            },
            "credentialDisplayValues": [
                {
                    "name": "Eläketodiste",
                    "description": "Todiste Kelan maksamasta kansaneläkkeestä",
                    "locale": "fi-FI",
                    "logo": {
                        "uri": issuerLogo,
                        "alt_text": issuerName
                    },
                    "background_color": "#003580",
                    "text_color": "#FFFFFF"
                },
                {
                    "name": "Pensioner's credential",
                    "description": "Proof that you get state pension paid by Kela",
                    "locale": "en-EN",
                    "logo": {
                        "uri": issuerLogo,
                        "alt_text": issuerName
                    },
                    "background_color": "#003580",
                    "text_color": "#FFFFFF"
                }
              ],
            interopProfileInstance: profileId
        })
    }
    params.headers['X-AGENT-ID'] = roles.issuer.id
    const resp = await fetch(templateUrl, params)
    const template = await resp.json()
    // console.log(resp.status, templateUrl, params, template)
    return template.templateId
}

