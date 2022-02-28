import dotenv from "dotenv";
dotenv.config();

import AxiosDigestAuth from "@mhoc/axios-digest-auth";
import { load } from "cheerio";
import { connect } from "async-mqtt";

const host = process.env.SPAHOST;

const mhost = process.env.MHOST;
const muser = process.env.MUSER;
const mpass = process.env.MPASS;

const getStatus = () => {
  const ADA = AxiosDigestAuth.default;
  const client = new ADA({
    username: process.env.SPAUSER,
    password: process.env.SPAPASS,
  });

  return client
    .request({
      url: `http://${host}/voice/`,
      method: "GET",
    })
    .then((response) => {
      const statusPage = response.data;
      const $ = load(statusPage);

      const getText = (node) => $(node).text().trim().replace(/:$/, "");

      const statusTable = $("#Info table.stat tbody");

      const rows = statusTable.find("tr");

      const result = {};
      let context = null;
      rows.each((i, row) => {
        if (
          row.children.length === 1 &&
          $(row.children[0]).text().trim() !== ""
        ) {
          context = getText(row.children[0]);
          result[context] = {};
        } else if (row.children.length === 4) {
          getText(row.children[0]) !== ""
            ? (result[context][getText(row.children[0])] = getText(
                row.children[1]
              ))
            : null;
          getText(row.children[2]) !== ""
            ? (result[context][getText(row.children[2])] = getText(
                row.children[3]
              ))
            : null;
        }
      });
      return result;
    });
};

const parseStatus = (status) => ({
  registration_state: status["Line 1 Status"]["Registration State"],
  hook_state: status["Line 1 Status"]["Hook State"],
  last_called_number: status["Line 1 Status"]["Last Called Number"],
  last_caller_number: status["Line 1 Status"]["Last Caller Number"],
  call_state: status["Line 1 Status"]["Call 1 State"],
  call_peer_name: status["Line 1 Status"]["Call 1 Peer Name"],
  call_peer_phone: status["Line 1 Status"]["Call 1 Peer Phone"],
  call_type: status["Line 1 Status"]["Call 1 Type"],
  call_duration: status["Line 1 Status"]["Call 1 Duration"],
});

getStatus().then(async (status) => {
  const mclient = await connect(`mqtt://${mhost}`, {
    username: muser,
    password: mpass,
  });

  const topicPrefix = `homeassistant/sensor`;
  const stateTopic = `${topicPrefix}/${status["Product Information"]["Product Name"]}/state`;

  const configMessages = Object.keys(parseStatus(status)).map((entity) => ({
    uniq_id: `${status["Product Information"]["Product Name"]}-${status["Product Information"]["Serial Number"]}-${entity}`,
    name: entity,
    stat_t: stateTopic,
    val_tpl: `{{value_json.${entity}}}`,
    ic: "mdi:phone",
    dev: {
      name: status["Product Information"]["Product Name"],
      mdl: status["Product Information"]["Product Name"],
      sw: status["Product Information"]["Software Version"],
      ids: [status["Product Information"]["Serial Number"]],
    },
  }));

  await Promise.all(
    configMessages.map((configMessage) =>
      mclient.publish(
        `${topicPrefix}/${configMessage.name}/config`,
        JSON.stringify(configMessage),
        {
          retain: true,
        }
      )
    )
  );

  await mclient.publish(stateTopic, JSON.stringify(parseStatus(status)));

  setInterval(() => {
    getStatus().then(async (status) => {
      await mclient.publish(stateTopic, JSON.stringify(parseStatus(status)));
    });
  }, 5000);
});
