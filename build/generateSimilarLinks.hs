#!/usr/bin/env runghc
{-# LANGUAGE OverloadedStrings #-}

module Main where

import Control.Monad (when, unless)
import Data.Containers.ListUtils (nubOrd)
import Data.List (sort)
import qualified Control.Monad.Parallel as Par (mapM_)
import System.Environment (getArgs)

import GenerateSimilar (bestNEmbeddings, embed, embeddings2Forest, findN, missingEmbeddings, readEmbeddings, similaritemExistsP, writeEmbeddings, writeOutMatch)
import LinkMetadata (readLinkMetadata)
import Utils (printGreen)

maxEmbedAtOnce :: Int
maxEmbedAtOnce = 100

main :: IO ()
main = do md  <- readLinkMetadata
          edb <- readEmbeddings
          printGreen "Read databases."

          -- update for any missing embeddings, and return updated DB for computing distances & writing out fragments:
          let todo = take maxEmbedAtOnce $ sort $ missingEmbeddings md edb
          edb'' <- if null todo then printGreen "All databases up to date." >> return edb else
                     do
                       printGreen $ "Embedding…\n" ++ unlines (map show todo)
                       newEmbeddings <- mapM (embed edb) todo
                       printGreen "Generated embeddings."
                       let edb' = nubOrd (edb ++ newEmbeddings)
                       writeEmbeddings edb'
                       printGreen "Wrote embeddings."
                       return edb'

          -- if we are only updating the embeddings, then we stop there and do nothing more. (This
          -- is useful for using `inotifywait` (from 'inotifytools' Debian package) to 'watch' the
          -- YAML databases for new entries, and immediately embed them then & there, so
          -- preprocess-markdown.hs's single-shot mode gets updated quickly with recently-written
          -- annotations, instead of always waiting for the nightly rebuild. When doing batches of
          -- new annotations, they are usually all relevant to each other, but won't appear in the
          -- suggested-links.)
          --
          -- eg. in a crontab, this would work:
          -- $ `@reboot screen -d -m -S "embed" bash -c 'cd ~/wiki/; while true; do inotifywait ~/wiki/metadata/*.yaml -e attrib && sleep 10s && date && runghc -istatic/build/ ./static/build/generateSimilarLinks.hs --update-only-embeddings; done'`
          --
          -- [ie.: 'at boot, start a background daemon which monitors the annotation files and
          -- whenever one is modified, kill the monitor, wait 10s, and check for new annotations to
          -- embed & save; if nothing, exit & restart the monitoring.']
          args <- getArgs
          when (args /= ["--update-only-embeddings"]) $ do
            -- Otherwise, we keep going & compute all the suggestions.
            -- rp-tree supports serializing the tree to disk, but unclear how to update it, and it's fast enough to construct that it's not a bottleneck, so we recompute it from the embeddings every time.
            let ddb  = embeddings2Forest edb''
            printGreen "Begin computing & writing out missing similarity-rankings…"
            Par.mapM_ (\e@(f,_,_,_,_) -> (do exists <- similaritemExistsP f
                                             unless exists $ writeOutMatch md $ findN ddb bestNEmbeddings e))
              edb''
            printGreen "Wrote out missing. Now writing out changed…"
            Par.mapM_ (writeOutMatch md . findN ddb bestNEmbeddings) edb''
            printGreen "Done."
