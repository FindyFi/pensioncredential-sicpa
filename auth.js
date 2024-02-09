import config from './config.json' assert {'type': 'json'}

const params = {
    method: 'POST',
    headers: {
        'Content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
        client_id: config.client_id,
        client_secret: config.client_secret,
        grant_type: "client_credentials"    
    })
}

// console.log(config)
// console.log(config.token_url, params)
const resp = await fetch(config.token_url, params)
const json = await resp.json()
// console.log(json)
export default `Bearer ${json.access_token}`

