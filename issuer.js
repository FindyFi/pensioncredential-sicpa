import { createServer } from 'node:http'
import QRCode from 'qrcode'
import auth from './auth.js'
import {config, jsonHeaders, roles, templateId} from './init.js'
import credential from './pensioncredential.json' with {type: 'json'}

const issueUrl = `${config.credentials_api}/openid4vc/credential-offer`

async function createOffer() {
  credential.issuer = roles.issuer.did
  credential.issuanceDate = new Date().toISOString()
  const credParams = {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      claims: credential.credentialSubject,
      credentialFormat: "SD-JWT-VC",
      templateId: templateId
    })
  }
  credParams.headers.Accept = '*/*'
  credParams.headers['X-AGENT-ID'] = roles.issuer.id
  console.log(issueUrl, JSON.stringify(credParams, null, 1))
  const resp = await fetch(issueUrl, credParams)
  console.log(resp.status, issueUrl)
  if (resp.status == 401) {
    // refresh auth token
    const auth_token = await auth()
    if (!auth_token) {
      throw new Error('Auth token refresh failed!')
    }
    jsonHeaders.Authorization = auth_token
    console.log(`refreshed auth token: ${jsonHeaders.Authorization}`)
    return createOffer() // recursion; possible infinite loop!
  }
  const obj = await resp.json()
  const offerUri = obj.credentialOfferUri
  if (!offerUri) {
    console.warn(resp.status, JSON.stringify(obj, null, 1))
  }
  // console.log(resp.status, offerUri)
  const credentialOffer = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(offerUri)}`
  // console.log(credentialOffer)
  return credentialOffer  
}

const sendOffer = async function (req, res) {
  if (req.url !== '/') {
    res.setHeader("Content-Type", "text/plain")
    res.writeHead(404)
    res.end(`Not Found`)
    return false
  }
  const offer = await createOffer()
  const dataURL = await QRCode.toDataURL(offer)
  res.setHeader("Content-Type", "text/html")
  res.writeHead(200)
  res.end(`<!DOCTYPE html>
<html>
 <meta charset="UTF-8">
 <title>SICPA myöntää eläketodisteen</title>
 <body style="text-align: center;">
  <img src="https://upload.wikimedia.org/wikipedia/en/thumb/6/67/Kela_suomi_kela-1-.jpg/220px-Kela_suomi_kela-1-.jpg" alt="Kela" />
  <h1>Heippa vahvasti tunnistettu asiakas!</h1>
  <p>Skannaapa oheinen QR-koodi digikukkarollasi niin laitetaan sinne eläketodistetta tulemaan...</p>
  <a href="${offer}"><img src="${dataURL}" alt="Credential Offer QR Code" /></a>
 </body>
</html>`)
}

const server = createServer(sendOffer)
server.listen(config.issuer_port, config.server_host, () => {
    console.log(`Server is running on http://${config.server_host}:${config.issuer_port}`)
})
