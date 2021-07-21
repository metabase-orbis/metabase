/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Collection from "metabase/entities/collections";

import { Sidebar, ToggleMobileSidebarIcon } from "./CollectionSidebar.styled";

import Header from "./CollectionSidebarHeader/CollectionSidebarHeader";
import Footer from "./CollectionSidebarFooter/CollectionSidebarFooter";
import Collections from "./Collections/Collections";

import LoadingSpinner from "metabase/components/LoadingSpinner";

import { getParentPath } from "metabase/collections/utils";

const getCurrentUser = ({ currentUser }) => ({ currentUser });

@Collection.loadList({
  /* pass "tree" here so that the collection entity knows to use the /tree endpoint and send children in the response
    we should eventually refactor code elsewhere in the app to use this by default instead of determining the relationships clientside, but this works in the interim
  */
  query: () => ({ tree: true }),

  // Using the default loading wrapper breaks the UI,
  // as the sidebar has a unique fixed left layout
  // It's disabled, so loading can be displayed appropriately
  // See: https://github.com/metabase/metabase/issues/14603
  loadingAndErrorWrapper: false,
})
class CollectionSidebar extends React.Component {
  state = {
    openCollections: [],
  };

  componentDidUpdate(prevProps) {
    const { collectionId, collections, loading } = this.props;
    const loaded = prevProps.loading && !loading;

    if (loaded) {
      const ancestors = getParentPath(collections, collectionId) || [];
      this.setState({ openCollections: ancestors });
    }
  }

  onOpen = id => {
    this.setState({ openCollections: this.state.openCollections.concat(id) });
  };

  onClose = id => {
    this.setState({
      openCollections: this.state.openCollections.filter(c => {
        return c !== id;
      }),
    });
  };

  // TODO Should we update the API to filter archived collections?

  renderContent = () => {
    const {
      currentUser,
      handleToggleMobileSidebar,
      isRoot,
      collectionId,
      list,
    } = this.props;
    return (
      <React.Fragment>
        <ToggleMobileSidebarIcon onClick={handleToggleMobileSidebar} />

        <Collection.Loader id="root">
          {({ collection: root }) => <Header isRoot={isRoot} root={root} />}
        </Collection.Loader>

        <Collections
          collectionId={collectionId}
          currentUserId={currentUser.id}
          list={list}
          onClose={this.onClose}
          onOpen={this.onOpen}
          openCollections={this.state.openCollections}
        />

        <Footer isSuperUser={currentUser.is_superuser} />
      </React.Fragment>
    );
  };

  render() {
    const { allFetched } = this.props;

    return (
      <Sidebar
        role="tree"
        shouldDisplayMobileSidebar={this.props.shouldDisplayMobileSidebar}
      >
        {allFetched ? (
          this.renderContent()
        ) : (
          <div className="text-brand text-centered">
            <LoadingSpinner />
            <h2 className="text-normal text-light mt1">{t`Loading…`}</h2>
          </div>
        )}
      </Sidebar>
    );
  }
}

export default connect(getCurrentUser)(CollectionSidebar);
