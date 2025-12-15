import { JSX } from "react";

const CardCollections: Array<[string, JSX.Element]> = ([
  ["dairi-sd", <span key="dairi-sd">
    Free super-deformed tachies from dairi Twitter 
      <a href="https://x.com/dairi155">@dairi155</a>. 
    I decided that some characters should look happier than others, and some gloomier.
  </span>],
  ["dairi", <span key="dairi">
    Free full-body tachies from dairi Twitter 
      <a href="https://x.com/dairi155">@dairi155</a>.
    Respect to the very diligent illustrator.
  </span>],
  ["enbu", <span key="enbu">
    Free tachies from RPG game 
    <a href="http://www.fo-lens.net/enbu_ap/">幻想人形演舞-ユメノカケラ-</a>. 
    Well, don&apos;t blame me if some characters&apos; head seem greater than others&apos;.
  </span>],
  ["enbu-dolls", <span key="enbu-dolls">
    Free tachies from RPG game 
    <a href="http://www.fo-lens.net/enbu_ap/">幻想人形演舞-ユメノカケラ-</a>. 
    They were intended for the dolls as a part of the original game. Cute aren&apos;t they?
  </span>],
  ["thbwiki-sd", <span key="thbwiki-sd">
    Art from 
    <a href="https://thwiki.cc/">THBWiki</a>. 
    Many thanks to the contributors of THBWiki for making these available.
  </span>],
  ["zun", <span key="zun">
    Well, cheers for those who love ZUN&apos;s art. 
    Who else on earth would use these for playing? 
    I don&apos;t have the copyright and should not have used these here, but let&apos;s pray no one cares.
  </span>]
]);

const MusicSources: Array<{ key: string; url: string; description: string }> = ([
  {
    key: "Cloudflare R2",
    url: "sources_cloudflare_r2.json",
    description: "Music hosted in a Cloudflare R2 Bucket. Cloudflare R2 Storage allows developers to store large amounts of unstructured data without the costly egress bandwidth fees associated with typical cloud storage services."
  },
  {
    key: "THBWiki",
    url: "sources_thbwiki.json",
    description: "Music from THBWiki. Why, sometimes very slow."
  },
  {
    key: "Netease 163",
    url: "sources_163.json",
    description: "Music from NetEase Cloud Music (163.com). Note that Netease blocks access from outside China."
  }
]);

const DefaultMusicSource = MusicSources[0];

export { CardCollections, MusicSources, DefaultMusicSource };