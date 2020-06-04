const { Requester, Validator } = require('@chainlink/external-adapter')

const createRequest = (input, callback) => {
  const validator = new Validator(callback, input)
  const jobRunID = validator.validated.id
  const url = 'https://fpiw7f0axc.execute-api.us-east-1.amazonaws.com/api'

  const config = {
    url,
    auth: {
      password: process.env.API_KEY
    }
  }

  Requester.request(config)
    .then(response => {
      response.data.result = Requester.validateResultNumber(response.data, ['index'])
      callback(response.status, Requester.success(jobRunID, response))
    })
    .catch(error => {
      callback(500, Requester.errored(jobRunID, error))
    })
}

module.exports.createRequest = createRequest
