import sqlite3 from 'sqlite3'
import config from './config.json' assert {'type': 'json'}
import { auth_token } from './auth.js'

const issuerName = 'Kela'
const issuerLogo = 'https://www.kela.fi/documents/20124/410402/logo-kela-rgb.png/50cdb366-b094-027e-2ac2-0439af6dc529?t=1643974848905'
const verifierName = 'HSL'
const verifierLogo = 'https://cdn-assets-cloud.frontify.com/s3/frontify-cloud-files-us/eyJwYXRoIjoiZnJvbnRpZnlcL2FjY291bnRzXC8yZFwvMTkyOTA4XC9wcm9qZWN0c1wvMjQ5NjY1XC9hc3NldHNcL2UzXC80NTY4ODQ2XC9lMjY2Zjg2NTU1Y2VjMGExZGM4ZmVkNDRiODdiMTNjNi0xNTk1NDI5MTAxLnN2ZyJ9:frontify:B-Us_1Aj3DJ5FKHvjZX1S0UOpg5wCFDIv4CNfy6rXQY?width=2400'

const jsonHeaders = {
    'Authorization': auth_token,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
}

const db = await openDB()
const roles = await initRoles()
export {db, roles}

function openDB() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(config.db_file, (err) => {
            if (err) reject(err.message)
            // console.log(`Connected to the database '${config.db_file}'.`)
            const create = `CREATE TABLE IF NOT EXISTS organizations (
                id INTEGER PRIMARY KEY,
                name varchar(50),
                clientId INTEGER,
                did VARCHAR(500),
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
        const insertOrganization = db.prepare("REPLACE INTO organizations (id, name, clientId, did, role) VALUES (?, ?, ?, ?, ?);")
        const selectOrganizations = "SELECT id, name, clientId, did, role FROM organizations;"
        const updateOrganization = "UPDATE organizations SET did = $did WHERE id = $id;"
        const roles = {}
        db.all(selectOrganizations, [], async (err, rows) => {
            if (err) throw err;
            rows.forEach((row) => {
                roles[row.role] = row
            })
            if (roles.issuer && roles.issuer.did && roles.verifier.did) {
                resolve(roles)
                return
            }
            const createOrganizationUrl = `${config.credentials_api}/organizations`
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
                    // console.log(createOrganizationUrl, orgParams)
                    const resp = await fetch(createOrganizationUrl, orgParams)
                    const org = await resp.json()
                    org.role = role
                    insertOrganization.run(org.id, org.clientId, org.name, "", role)
                    roles[role] = org
                }
                if (!roles[role].did) {
                    const createDIDUrl = `${config.credentials_api}/organizations/${roles[role].id}/issuance-dids`
                    const didParams = {
                        method: 'POST',
                        headers: jsonHeaders,
                        body: JSON.stringify({
                            "keyType": "ed25519",
                            "method": "web"
                        })
                    }
                    // console.log(createDIDUrl, orgParams)
                    const resp = await fetch(createDIDUrl, didParams)
                    const json = await resp.json()
                    roles[role].did = json.did
                    // console.log(json)
                    db.run(updateOrganization, [roles[role].did, roles[role].id])
                }
            }
            resolve(roles)
        })
    })
}
        


