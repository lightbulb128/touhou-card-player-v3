import { JSX } from "react";

const CardCollections: Array<[string, JSX.Element]> = ([
  ["dairi-sd", <span>
    Free super-deformed tachies from dairi Twitter 
      <a href="https://x.com/dairi155">@dairi155</a>. 
    I decided that some characters should look happier than others, and some gloomier.
  </span>],
  ["dairi", <span>
    Free full-body tachies from dairi Twitter 
      <a href="https://x.com/dairi155">@dairi155</a>.
    Respect to the very diligent illustrator.
  </span>],
  ["enbu", <span>
    Free tachies from RPG game 
    <a href="http://www.fo-lens.net/enbu_ap/">幻想人形演舞-ユメノカケラ-</a>. 
    Well, don't blame me if some characters' head seem greater than others'.
  </span>],
  ["enbu-dolls", <span>
    Free tachies from RPG game 
    <a href="http://www.fo-lens.net/enbu_ap/">幻想人形演舞-ユメノカケラ-</a>. 
    They were intended for the dolls as a part of the original game. Cute aren't they?
  </span>],
  ["thbwiki-sd", <span>
    Art from 
    <a href="https://thwiki.cc/">THBWiki</a>. 
    Many thanks to the contributors of THBWiki for making these available.
  </span>],
  ["zun", <span>
    Well, cheers for those who love ZUN's art. 
    Who else on earth would use these for playing? 
    I don't have the copyright and should not have used these here, but let's pray no one cares.
  </span>]
]);

const MusicSources: Array<{ key: string; url: string; description: string }> = ([
  {
    key: "cloudflare-r2",
    url: "/sources_cloudflare_r2.json",
    description: "Cloudflare R2 Bucket"
  },
  {
    key: "thbwiki",
    url: "/sources_thbwiki.json",
    description: "THBWiki"
  },
]);

const DefaultMusicSource = MusicSources[0];

export { CardCollections, MusicSources, DefaultMusicSource };